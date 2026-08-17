"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import {
  Users,
  Trophy,
  XCircle,
  Percent,
  TrendingUp,
  Clock,
  ArrowRight,
  Plus,
  Kanban,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Phone,
  MessageSquare,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SkeletonCard } from "@/components/dashboard/skeleton";
import { Button } from "@/components/ui/button";
import { loadSalesCrmMetrics, type SalesCrmMetrics } from "@/lib/dashboard/crm-metrics";

export default function DashboardPage() {
  const { defaultCurrency } = useAuth();
  const [data, setData] = useState<SalesCrmMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const db = createClient();
      const metrics = await loadSalesCrmMetrics(db);
      setData(metrics);
    } catch (err) {
      console.error("[Dashboard] Load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const leadDelta = (data?.newLeadsToday ?? 0) - (data?.newLeadsYesterday ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Sales & Conversion Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track incoming lead volume, conversion rates, and closed won revenue in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/pipelines">
            <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <Kanban className="size-4" />
              Open Deal Pipeline
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 Primary Conversion Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title="Total Lead Inflow"
              value={data.totalLeads.toLocaleString()}
              icon={Users}
              subtitle={`${data.newLeadsToday} new leads today`}
              delta={{
                sign: leadDelta,
                label: `${leadDelta >= 0 ? "+" : ""}${leadDelta} vs yesterday`,
              }}
            />

            <MetricCard
              title="Won Conversions"
              value={data.wonDealsCount.toLocaleString()}
              icon={Trophy}
              subtitle={`Total Revenue: ${formatCurrency(data.wonDealsValue, defaultCurrency)}`}
            />

            <MetricCard
              title="Lost / Dropped"
              value={data.lostDealsCount.toLocaleString()}
              icon={XCircle}
              subtitle="Unconverted opportunities"
            />

            <MetricCard
              title="Conversion Rate"
              value={`${data.conversionRate}%`}
              icon={Percent}
              subtitle={`${data.openDealsCount} active deals in pipeline`}
            />
          </>
        )}
      </div>

      {/* Main Grid: Pipeline Funnel + Live Activities */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Pipeline Stage Breakdown */}
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">
                Pipeline Funnel & Lead Flow
              </h2>
            </div>
            <Link
              href="/pipelines"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Manage Stages <ArrowRight className="size-3" />
            </Link>
          </div>

          <p className="text-xs text-muted-foreground">
            Distribution of leads and monetary deal value across your pipeline stages.
          </p>

          <div className="space-y-3 pt-2">
            {loading || !data ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading funnel...</div>
            ) : data.stages.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No pipeline stages found.</div>
            ) : (
              data.stages.map((stage) => {
                const maxCount = Math.max(...data.stages.map((s) => s.count), 1);
                const percent = Math.round((stage.count / maxCount) * 100);

                return (
                  <div key={stage.id} className="space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="font-semibold text-foreground">{stage.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-foreground">
                          {stage.count} {stage.count === 1 ? "lead" : "leads"}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {formatCurrency(stage.value, defaultCurrency)}
                        </span>
                      </div>
                    </div>

                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(percent, 4)}%`,
                          backgroundColor: stage.color || "#10b981",
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent CRM Activities & Conversions */}
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="size-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">
                Recent CRM Events
              </h2>
            </div>
            <Link
              href="/pipelines?view=schedule"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Schedule <ArrowRight className="size-3" />
            </Link>
          </div>

          <p className="text-xs text-muted-foreground">
            Live log of follow-ups, calls, and conversions logged from WhatsApp Web.
          </p>

          <div className="space-y-2.5 pt-2">
            {loading || !data ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading activities...</div>
            ) : data.recentActivities.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No activities logged yet. Select any contact in WhatsApp Web to schedule follow-ups.
              </div>
            ) : (
              data.recentActivities.map((act) => (
                <div
                  key={act.id}
                  className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 p-3 text-xs"
                >
                  <div className="mt-0.5 rounded-lg bg-primary/10 p-1.5 text-primary">
                    {act.type === "call" ? (
                      <Phone className="size-3.5" />
                    ) : act.type === "meeting" ? (
                      <Calendar className="size-3.5" />
                    ) : (
                      <MessageSquare className="size-3.5" />
                    )}
                  </div>
                  <div className="flex-1 space-y-0.5 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-foreground truncate">
                        {act.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(act.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Contact: {act.contact_name}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
