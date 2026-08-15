"use client";

import { useState, useEffect, useCallback } from "react";
import { format, isToday, isPast } from "date-fns";
import {
  Phone,
  Video,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Loader2,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { CrmActivity } from "@/types";

interface CrmActivitiesViewProps {
  onSelectDeal?: (dealId: string) => void;
}

export function CrmActivitiesView({ onSelectDeal }: CrmActivitiesViewProps) {
  const [tab, setTab] = useState<"today" | "overdue" | "all">("today");
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/crm/activities?limit=100";
      if (tab === "today") url += "&today=true";
      if (tab === "overdue") url += "&overdue=true";

      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.activities)) {
        setActivities(data.activities);
      }
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const handleMarkComplete = async (activityId: string) => {
    try {
      const res = await fetch(`/api/crm/activities/${activityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completed_at: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        toast.success("Activity marked as completed!");
        await loadActivities();
      }
    } catch {
      toast.error("Failed to update activity");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="size-5 text-primary" />
            Activities & Follow-Ups Hub
          </h2>
          <p className="text-xs text-muted-foreground">
            Track scheduled calls, Google Meet appointments, tasks, and follow-ups.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-muted p-1 rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setTab("today")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              tab === "today"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Today&apos;s Follow-Ups
          </button>
          <button
            type="button"
            onClick={() => setTab("overdue")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              tab === "overdue"
                ? "bg-red-500/20 text-red-400 shadow-sm font-semibold"
                : "text-muted-foreground hover:text-red-400"
            }`}
          >
            Overdue
          </button>
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              tab === "all"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Activities
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : activities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-2">
          <CheckCircle2 className="size-8 text-emerald-400 mx-auto" />
          <h3 className="text-sm font-semibold text-foreground">
            {tab === "overdue" ? "No Overdue Activities!" : "All Caught Up!"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {tab === "overdue"
              ? "Awesome! You have no missed follow-ups or overdue calls."
              : "No pending activities for this filter. Schedule a call or meeting from any lead workspace."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((act) => {
            const isCall = act.type === "call";
            const isMeet = act.type === "meeting" || act.type === "google_meet";
            const isPending = act.status === "pending";
            const isOverdue = isPending && act.scheduled_at && isPast(new Date(act.scheduled_at)) && !isToday(new Date(act.scheduled_at));

            return (
              <div
                key={act.id}
                className={`rounded-2xl border p-4 shadow-sm flex flex-col justify-between space-y-3 bg-card transition-all ${
                  isOverdue ? "border-red-500/40 bg-red-500/5" : "border-border"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      {isCall && <Phone className="size-3.5 text-emerald-400" />}
                      {isMeet && <Video className="size-3.5 text-blue-400" />}
                      {!isCall && !isMeet && <Clock className="size-3.5 text-amber-400" />}
                      {act.title}
                    </span>

                    {isPending ? (
                      <Badge
                        variant="outline"
                        className={isOverdue ? "border-red-500/40 text-red-400 bg-red-500/10 text-[10px]" : "border-primary/40 text-primary bg-primary/10 text-[10px]"}
                      >
                        {isOverdue ? "OVERDUE" : "PENDING"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]">
                        COMPLETED
                      </Badge>
                    )}
                  </div>

                  {act.scheduled_at && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                      <Calendar className="size-3" />
                      {format(new Date(act.scheduled_at), "EEE, MMM d 'at' h:mm a")}
                    </div>
                  )}

                  {act.deal && (
                    <div className="text-xs text-foreground">
                      Deal: <strong className="text-primary">{act.deal.title}</strong> ({act.deal.currency || "$"}{Number(act.deal.value || 0).toLocaleString()})
                    </div>
                  )}

                  {act.contact && (
                    <div className="text-xs text-muted-foreground">
                      Customer: {act.contact.name || act.contact.phone}
                    </div>
                  )}

                  {act.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {act.description}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                  {act.google_meet_url && (
                    <a
                      href={act.google_meet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300"
                    >
                      <Video className="size-3" />
                      Join Meet
                    </a>
                  )}

                  {act.deal_id && onSelectDeal && (
                    <button
                      type="button"
                      onClick={() => onSelectDeal(act.deal_id!)}
                      className="text-xs text-muted-foreground hover:text-foreground font-medium underline"
                    >
                      Open Lead
                    </button>
                  )}

                  {isPending && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMarkComplete(act.id)}
                      className="h-7 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 ml-auto"
                    >
                      <CheckCircle2 className="size-3 mr-1" />
                      Complete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
