import type { SupabaseClient } from '@supabase/supabase-js';

export interface SalesCrmMetrics {
  totalLeads: number;
  newLeadsToday: number;
  newLeadsYesterday: number;
  wonDealsCount: number;
  wonDealsValue: number;
  lostDealsCount: number;
  openDealsCount: number;
  openDealsValue: number;
  conversionRate: number;
  stages: Array<{
    id: string;
    name: string;
    color: string;
    count: number;
    value: number;
  }>;
  recentActivities: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    status: string;
    created_at: string;
    contact_name?: string;
  }>;
}

export async function loadSalesCrmMetrics(db: SupabaseClient): Promise<SalesCrmMetrics> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStart = yesterday.toISOString();

  const [
    totalLeadsRes,
    leadsTodayRes,
    leadsYesterdayRes,
    dealsRes,
    stagesRes,
    activitiesRes,
  ] = await Promise.all([
    db.from('contacts').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('deals').select('id, title, value, currency, status, stage_id, created_at, won_at, lost_at'),
    db.from('pipeline_stages').select('id, name, color, position').order('position', { ascending: true }),
    db
      .from('crm_activities')
      .select('id, type, title, description, status, created_at, contact:contacts(name)')
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  const deals = dealsRes.data || [];
  const stages = stagesRes.data || [];

  let wonCount = 0;
  let wonValue = 0;
  let lostCount = 0;
  let openCount = 0;
  let openValue = 0;

  const stageMap: Record<string, { count: number; value: number }> = {};
  stages.forEach((s) => {
    stageMap[s.id] = { count: 0, value: 0 };
  });

  deals.forEach((d: any) => {
    const val = parseFloat(d.value) || 0;
    const status = (d.status || 'open').toLowerCase();

    if (status === 'won') {
      wonCount++;
      wonValue += val;
    } else if (status === 'lost') {
      lostCount++;
    } else {
      openCount++;
      openValue += val;
    }

    if (d.stage_id && stageMap[d.stage_id]) {
      stageMap[d.stage_id].count++;
      stageMap[d.stage_id].value += val;
    }
  });

  const totalClosed = wonCount + lostCount;
  const conversionRate = totalClosed > 0 ? Math.round((wonCount / totalClosed) * 100) : wonCount > 0 ? 100 : 0;

  const stageBreakdown = stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color || '#10b981',
    count: stageMap[s.id]?.count || 0,
    value: stageMap[s.id]?.value || 0,
  }));

  const recentActivities = (activitiesRes.data || []).map((a: any) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    description: a.description,
    status: a.status,
    created_at: a.created_at,
    contact_name: a.contact?.name || 'Lead',
  }));

  return {
    totalLeads: totalLeadsRes.count ?? deals.length,
    newLeadsToday: leadsTodayRes.count ?? 0,
    newLeadsYesterday: leadsYesterdayRes.count ?? 0,
    wonDealsCount: wonCount,
    wonDealsValue: wonValue,
    lostDealsCount: lostCount,
    openDealsCount: openCount,
    openDealsValue: openValue,
    conversionRate,
    stages: stageBreakdown,
    recentActivities,
  };
}
