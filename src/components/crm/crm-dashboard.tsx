"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Trophy,
  XCircle,
  Phone,
  Video,
  Clock,
  Filter,
  Calendar,
  Layers,
  ArrowRight,
  Loader2,
  PieChart,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

export function CrmDashboard() {
  const { defaultCurrency } = useAuth();
  const [datePreset, setDatePreset] = useState("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [compareMode, setCompareMode] = useState(false);

  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Compute dates based on preset
  const getDateRange = useCallback(() => {
    const now = new Date();
    let from = startOfMonth(now);
    let to = endOfMonth(now);
    let compareFrom = startOfMonth(subMonths(now, 1));
    let compareTo = endOfMonth(subMonths(now, 1));

    if (datePreset === "today") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      compareFrom = subDays(from, 1);
      compareTo = new Date(compareFrom.getFullYear(), compareFrom.getMonth(), compareFrom.getDate(), 23, 59, 59);
    } else if (datePreset === "yesterday") {
      from = subDays(now, 1);
      to = from;
      compareFrom = subDays(from, 1);
      compareTo = compareFrom;
    } else if (datePreset === "this_week") {
      from = startOfWeek(now, { weekStartsOn: 1 });
      to = endOfWeek(now, { weekStartsOn: 1 });
      compareFrom = subDays(from, 7);
      compareTo = subDays(to, 7);
    } else if (datePreset === "last_week") {
      const lastWeekNow = subDays(now, 7);
      from = startOfWeek(lastWeekNow, { weekStartsOn: 1 });
      to = endOfWeek(lastWeekNow, { weekStartsOn: 1 });
      compareFrom = subDays(from, 7);
      compareTo = subDays(to, 7);
    } else if (datePreset === "this_month") {
      from = startOfMonth(now);
      to = endOfMonth(now);
      compareFrom = startOfMonth(subMonths(now, 1));
      compareTo = endOfMonth(subMonths(now, 1));
    } else if (datePreset === "last_month") {
      const lastMonthNow = subMonths(now, 1);
      from = startOfMonth(lastMonthNow);
      to = endOfMonth(lastMonthNow);
      compareFrom = startOfMonth(subMonths(lastMonthNow, 1));
      compareTo = endOfMonth(subMonths(lastMonthNow, 1));
    } else if (datePreset === "this_quarter") {
      from = startOfQuarter(now);
      to = endOfQuarter(now);
    } else if (datePreset === "this_year") {
      from = startOfYear(now);
      to = endOfYear(now);
    } else if (datePreset === "custom" && customFrom && customTo) {
      from = new Date(customFrom);
      to = new Date(customTo);
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      compareFrom: compareFrom ? compareFrom.toISOString() : undefined,
      compareTo: compareTo ? compareTo.toISOString() : undefined,
    };
  }, [datePreset, customFrom, customTo]);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to, compareFrom, compareTo } = getDateRange();
      let url = `/api/crm/analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      if (compareMode && compareFrom && compareTo) {
        url += `&compare_from=${encodeURIComponent(compareFrom)}&compare_to=${encodeURIComponent(compareTo)}`;
      }

      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAnalytics(data);
      }
    } finally {
      setLoading(false);
    }
  }, [getDateRange, compareMode]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const m = analytics?.metrics || {};
  const chg = analytics?.change_percentage || {};
  const curr = defaultCurrency || "USD";

  return (
    <div className="space-y-6">
      {/* Header & Date Range Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <TrendingUp className="size-5 text-primary" />
            CRM Sales & Funnel Dashboard
          </h2>
          <p className="text-xs text-muted-foreground">
            Real-time pipeline metrics, conversion funnel, revenue analytics, and historical performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Selector */}
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="last_week">Last Week</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom Date Range</option>
          </select>

          {datePreset === "custom" && (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 w-32 bg-card text-xs border-border"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 w-32 bg-card text-xs border-border"
              />
            </div>
          )}

          {/* Comparison Mode Toggle */}
          <Button
            type="button"
            variant={compareMode ? "default" : "outline"}
            size="sm"
            onClick={() => setCompareMode(!compareMode)}
            className={`h-9 text-xs gap-1.5 ${compareMode ? "bg-primary text-primary-foreground" : "border-border"}`}
          >
            <Percent className="size-3.5" />
            Compare Mode {compareMode ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* 14 KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {/* Won Revenue */}
            <div className="col-span-2 sm:col-span-1 xl:col-span-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
                <span>Won Revenue</span>
                <Trophy className="size-4" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {curr} {Number(m.total_won_revenue || 0).toLocaleString()}
              </div>
              {compareMode && (
                <div className={`text-[11px] font-medium flex items-center gap-1 ${chg.total_won_revenue >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {chg.total_won_revenue >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {chg.total_won_revenue > 0 ? `+${chg.total_won_revenue}%` : `${chg.total_won_revenue}%`} vs prior
                </div>
              )}
            </div>

            {/* Total Pipeline Value */}
            <div className="col-span-2 sm:col-span-1 xl:col-span-2 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-blue-400 font-medium">
                <span>Active Pipeline Value</span>
                <DollarSign className="size-4" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {curr} {Number(m.total_pipeline_value || 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {m.active_leads || 0} active deals in pipeline
              </div>
            </div>

            {/* Conversion Rate */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Conversion Rate</span>
                <Percent className="size-4 text-primary" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {m.conversion_rate || 0}%
              </div>
              {compareMode && (
                <div className={`text-[11px] ${chg.conversion_rate >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {chg.conversion_rate > 0 ? `+${chg.conversion_rate}%` : `${chg.conversion_rate}%`}
                </div>
              )}
            </div>

            {/* Win Rate */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Win Rate</span>
                <Trophy className="size-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {m.win_rate || 0}%
              </div>
              <div className="text-[11px] text-muted-foreground">
                {m.won_leads || 0} won / {m.lost_leads || 0} lost
              </div>
            </div>

            {/* Avg Deal Size */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Avg Deal Size</span>
                <DollarSign className="size-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {curr} {Number(m.avg_deal_value || 0).toLocaleString()}
              </div>
              {compareMode && (
                <div className={`text-[11px] ${chg.avg_deal_value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {chg.avg_deal_value > 0 ? `+${chg.avg_deal_value}%` : `${chg.avg_deal_value}%`}
                </div>
              )}
            </div>

            {/* Total Leads */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total Leads</span>
                <Users className="size-4 text-primary" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {m.total_leads || 0}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {m.new_leads || 0} in this period
              </div>
            </div>

            {/* Avg Sales Cycle */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Avg Sales Cycle</span>
                <Clock className="size-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {m.avg_sales_cycle_days || 0} days
              </div>
              <div className="text-[11px] text-muted-foreground">
                Creation to Won
              </div>
            </div>

            {/* Calls Completed */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Calls Completed</span>
                <Phone className="size-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {m.calls_completed || 0}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Logged in CRM
              </div>
            </div>

            {/* Meetings Completed */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Meetings Done</span>
                <Video className="size-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {m.meetings_completed || 0}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Google Meets & In-person
              </div>
            </div>
          </div>

          {/* Visual Sales Funnel */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  Sales Pipeline Conversion Funnel
                </h3>
                <p className="text-xs text-muted-foreground">
                  Visual stage-by-stage progression and conversion drop-off percentages.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 pt-2">
              {(analytics?.funnel || []).map((stage: any, index: number) => (
                <div
                  key={stage.stage_id}
                  className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        backgroundColor: `${stage.color || "#3b82f6"}20`,
                        color: stage.color || "#3b82f6",
                      }}
                    >
                      Stage {index + 1}
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      {stage.count} deals
                    </span>
                  </div>

                  <div>
                    <div className="text-sm font-bold text-foreground truncate">{stage.stage_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {curr} {Number(stage.value || 0).toLocaleString()}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/50 text-[11px] flex justify-between text-muted-foreground">
                    <span>{stage.pct_of_total}% of Total</span>
                    {index > 0 && (
                      <span className="text-emerald-400 font-medium">
                        {stage.conversion_from_prev}% pass
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lost Reasons Breakdown & Lead Source ROI */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Lost Reasons Analytics */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <XCircle className="size-4 text-red-400" />
                  Lost Reasons Analytics
                </h3>
                <p className="text-xs text-muted-foreground">
                  Why leads are not converting into customers.
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                {(analytics?.lost_reasons || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    No lost deals recorded in this period.
                  </p>
                ) : (
                  (analytics?.lost_reasons || []).map((lr: any) => (
                    <div key={lr.reason} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">{lr.reason}</span>
                        <span className="text-muted-foreground font-mono">
                          {lr.count} leads ({lr.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-red-400 transition-all"
                          style={{ width: `${Math.max(3, lr.percentage)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Salesperson Performance Leaderboard */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Trophy className="size-4 text-amber-400" />
                  Sales Team Leaderboard
                </h3>
                <p className="text-xs text-muted-foreground">
                  Revenue closed and conversion rate per team member.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                {(analytics?.leaderboard || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    No team member data available.
                  </p>
                ) : (
                  (analytics?.leaderboard || []).map((agent: any, idx: number) => (
                    <div
                      key={agent.user_id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-5 items-center justify-center rounded-full bg-muted font-bold text-[10px] text-muted-foreground">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-foreground">{agent.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {agent.won_deals} won / {agent.total_deals} total ({agent.win_rate}% win)
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-bold text-emerald-400">
                        {curr} {Number(agent.won_revenue || 0).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
