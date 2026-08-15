import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

interface PeriodMetrics {
  total_leads: number;
  new_leads: number;
  active_leads: number;
  won_leads: number;
  lost_leads: number;
  conversion_rate: number;
  win_rate: number;
  total_pipeline_value: number;
  total_won_revenue: number;
  total_lost_value: number;
  avg_deal_value: number;
  avg_sales_cycle_days: number;
  calls_completed: number;
  meetings_completed: number;
}

async function computeMetricsForRange(
  accountId: string,
  fromDate?: string | null,
  toDate?: string | null
): Promise<PeriodMetrics> {
  const admin = supabaseAdmin();

  // 1. Fetch deals for this account
  let dealsQuery = admin
    .from("deals")
    .select("id, value, currency, status, created_at, won_at, lost_at, won_reason, lost_reason, source, assigned_to")
    .eq("account_id", accountId);

  const { data: dealsRaw } = await dealsQuery;
  const allDeals = dealsRaw || [];

  // Filter deals based on date range
  const fromMs = fromDate ? new Date(fromDate).getTime() : 0;
  const toMs = toDate ? new Date(toDate).getTime() : Infinity;

  const inPeriodDeals = allDeals.filter((d) => {
    const createdMs = new Date(d.created_at).getTime();
    return createdMs >= fromMs && createdMs <= toMs;
  });

  const wonDealsInPeriod = allDeals.filter((d) => {
    if (d.status !== "won") return false;
    const wonMs = new Date(d.won_at || d.created_at).getTime();
    return wonMs >= fromMs && wonMs <= toMs;
  });

  const lostDealsInPeriod = allDeals.filter((d) => {
    if (d.status !== "lost") return false;
    const lostMs = new Date(d.lost_at || d.created_at).getTime();
    return lostMs >= fromMs && lostMs <= toMs;
  });

  const activeDealsInPeriod = allDeals.filter((d) => d.status === "open" || !d.status);

  // 2. Fetch contacts for this account
  const { count: totalContacts } = await admin
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId);

  // 3. Fetch activities completed
  let actQuery = admin
    .from("crm_activities")
    .select("id, type, status, completed_at, created_at")
    .eq("account_id", accountId)
    .eq("status", "completed");

  if (fromDate) actQuery = actQuery.gte("completed_at", fromDate);
  if (toDate) actQuery = actQuery.lte("completed_at", toDate);

  const { data: actsRaw } = await actQuery;
  const acts = actsRaw || [];

  const callsCompleted = acts.filter((a) => a.type === "call").length;
  const meetingsCompleted = acts.filter((a) => a.type === "meeting" || a.type === "google_meet").length;

  const totalLeads = inPeriodDeals.length > 0 ? inPeriodDeals.length : (totalContacts || 0);
  const wonCount = wonDealsInPeriod.length;
  const lostCount = lostDealsInPeriod.length;
  const closedCount = wonCount + lostCount;

  const totalWonRevenue = wonDealsInPeriod.reduce((acc, d) => acc + (Number(d.value) || 0), 0);
  const totalLostValue = lostDealsInPeriod.reduce((acc, d) => acc + (Number(d.value) || 0), 0);
  const totalPipelineValue = activeDealsInPeriod.reduce((acc, d) => acc + (Number(d.value) || 0), 0);

  const conversionRate = totalLeads > 0 ? (wonCount / totalLeads) * 100 : 0;
  const winRate = closedCount > 0 ? (wonCount / closedCount) * 100 : 0;
  const avgDealValue = wonCount > 0 ? totalWonRevenue / wonCount : 0;

  // Average sales cycle in days
  let totalCycleDays = 0;
  let cycleCount = 0;
  for (const d of wonDealsInPeriod) {
    if (d.won_at && d.created_at) {
      const diffMs = new Date(d.won_at).getTime() - new Date(d.created_at).getTime();
      const diffDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
      totalCycleDays += diffDays;
      cycleCount++;
    }
  }
  const avgSalesCycleDays = cycleCount > 0 ? Math.round(totalCycleDays / cycleCount) : 0;

  return {
    total_leads: totalLeads,
    new_leads: inPeriodDeals.length,
    active_leads: activeDealsInPeriod.length,
    won_leads: wonCount,
    lost_leads: lostCount,
    conversion_rate: parseFloat(conversionRate.toFixed(1)),
    win_rate: parseFloat(winRate.toFixed(1)),
    total_pipeline_value: totalPipelineValue,
    total_won_revenue: totalWonRevenue,
    total_lost_value: totalLostValue,
    avg_deal_value: parseFloat(avgDealValue.toFixed(2)),
    avg_sales_cycle_days: avgSalesCycleDays,
    calls_completed: callsCompleted,
    meetings_completed: meetingsCompleted,
  };
}

export async function GET(request: Request) {
  try {
    const { accountId } = await getCurrentAccount();
    const { searchParams } = new URL(request.url);

    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");
    const compareFrom = searchParams.get("compare_from");
    const compareTo = searchParams.get("compare_to");
    const pipelineId = searchParams.get("pipeline_id");

    const admin = supabaseAdmin();

    // 1. Compute Primary Period Metrics
    const current = await computeMetricsForRange(accountId, fromDate, toDate);

    // 2. Compute Comparison Metrics if requested
    let comparison: PeriodMetrics | null = null;
    let changePercentage: Partial<Record<keyof PeriodMetrics, number>> = {};

    if (compareFrom && compareTo) {
      comparison = await computeMetricsForRange(accountId, compareFrom, compareTo);
      for (const key of Object.keys(current) as (keyof PeriodMetrics)[]) {
        const currVal = current[key];
        const prevVal = comparison[key];
        if (prevVal === 0) {
          changePercentage[key] = currVal > 0 ? 100 : 0;
        } else {
          changePercentage[key] = parseFloat((((currVal - prevVal) / prevVal) * 100).toFixed(1));
        }
      }
    }

    // 3. Stage-by-Stage Sales Funnel
    let stagesQuery = admin
      .from("pipeline_stages")
      .select("id, name, color, position, pipeline_id")
      .order("position", { ascending: true });

    if (pipelineId) stagesQuery = stagesQuery.eq("pipeline_id", pipelineId);

    const { data: stagesRaw } = await stagesQuery;
    const stages = stagesRaw || [];

    const { data: dealsInPipeline } = await admin
      .from("deals")
      .select("id, stage_id, value, status")
      .eq("account_id", accountId);

    const allDeals = dealsInPipeline || [];
    const totalPipelineDealsCount = allDeals.length;

    const funnel = stages.map((stg, idx) => {
      const dealsInStage = allDeals.filter((d) => d.stage_id === stg.id);
      const count = dealsInStage.length;
      const value = dealsInStage.reduce((acc, d) => acc + (Number(d.value) || 0), 0);
      const pctOfTotal = totalPipelineDealsCount > 0 ? (count / totalPipelineDealsCount) * 100 : 0;

      let conversionFromPrev = 100;
      if (idx > 0 && stages[idx - 1]) {
        const prevStageCount = allDeals.filter((d) => d.stage_id === stages[idx - 1].id).length;
        conversionFromPrev = prevStageCount > 0 ? (count / prevStageCount) * 100 : 0;
      }

      return {
        stage_id: stg.id,
        stage_name: stg.name,
        color: stg.color,
        count,
        value,
        pct_of_total: parseFloat(pctOfTotal.toFixed(1)),
        conversion_from_prev: parseFloat(conversionFromPrev.toFixed(1)),
      };
    });

    // 4. Lost Reasons Breakdown
    const { data: lostDealsRaw } = await admin
      .from("deals")
      .select("id, lost_reason, value")
      .eq("account_id", accountId)
      .eq("status", "lost");

    const lostDeals = lostDealsRaw || [];
    const lostReasonsMap: Record<string, { count: number; value: number }> = {};

    for (const d of lostDeals) {
      const reason = d.lost_reason || "Unspecified";
      if (!lostReasonsMap[reason]) lostReasonsMap[reason] = { count: 0, value: 0 };
      lostReasonsMap[reason].count++;
      lostReasonsMap[reason].value += Number(d.value) || 0;
    }

    const lostReasons = Object.entries(lostReasonsMap).map(([reason, stats]) => ({
      reason,
      count: stats.count,
      value: stats.value,
      percentage: lostDeals.length > 0 ? parseFloat(((stats.count / lostDeals.length) * 100).toFixed(1)) : 0,
    }));

    // 5. Lead Source Breakdown
    const { data: sourceDealsRaw } = await admin
      .from("deals")
      .select("id, source, value, status")
      .eq("account_id", accountId);

    const sourceMap: Record<string, { total: number; won: number; revenue: number }> = {};
    for (const d of sourceDealsRaw || []) {
      const src = d.source || "Direct / WhatsApp";
      if (!sourceMap[src]) sourceMap[src] = { total: 0, won: 0, revenue: 0 };
      sourceMap[src].total++;
      if (d.status === "won") {
        sourceMap[src].won++;
        sourceMap[src].revenue += Number(d.value) || 0;
      }
    }

    const leadSources = Object.entries(sourceMap).map(([source, stats]) => ({
      source,
      total_leads: stats.total,
      won_leads: stats.won,
      revenue: stats.revenue,
      conversion_rate: stats.total > 0 ? parseFloat(((stats.won / stats.total) * 100).toFixed(1)) : 0,
    }));

    // 6. Salesperson Leaderboard
    const { data: profilesRaw } = await admin
      .from("profiles")
      .select("id, full_name, email, avatar_url");

    const profiles = profilesRaw || [];
    const leaderboard = profiles.map((p) => {
      const userDeals = allDeals.filter((d: any) => d.assigned_to === p.id);
      const userWon = userDeals.filter((d) => d.status === "won");
      const revenue = userWon.reduce((acc, d) => acc + (Number(d.value) || 0), 0);
      const winRate = userDeals.length > 0 ? (userWon.length / userDeals.length) * 100 : 0;

      return {
        user_id: p.id,
        name: p.full_name || p.email || "Agent",
        avatar_url: p.avatar_url,
        total_deals: userDeals.length,
        won_deals: userWon.length,
        won_revenue: revenue,
        win_rate: parseFloat(winRate.toFixed(1)),
      };
    }).sort((a, b) => b.won_revenue - a.won_revenue);

    return NextResponse.json({
      metrics: current,
      comparison,
      change_percentage: changePercentage,
      funnel,
      lost_reasons: lostReasons,
      lead_sources: leadSources,
      leaderboard,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
