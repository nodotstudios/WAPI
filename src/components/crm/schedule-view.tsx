"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  format,
  isToday,
  isPast,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  Clock,
  Phone,
  Video,
  List,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  User,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { CrmActivity } from "@/types";

interface ScheduleViewProps {
  onSelectDeal?: (dealId: string) => void;
}

export function ScheduleView({ onSelectDeal }: ScheduleViewProps) {
  const [viewMode, setViewMode] = useState<"row" | "calendar">("row");
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // Calendar date navigation
  const [currentDate, setCurrentDate] = useState(new Date());

  const loadActivitiesAndTeam = useCallback(async () => {
    setLoading(true);
    try {
      const [actRes, analyticsRes] = await Promise.all([
        fetch("/api/crm/activities?limit=100", { cache: "no-store" }),
        fetch("/api/crm/analytics", { cache: "no-store" }),
      ]);

      const actData = await actRes.json().catch(() => ({}));
      const analyticsData = await analyticsRes.json().catch(() => ({}));

      if (actRes.ok && Array.isArray(actData.activities)) {
        setActivities(actData.activities);
      }
      if (analyticsRes.ok && Array.isArray(analyticsData.team_members)) {
        setTeamMembers(analyticsData.team_members);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActivitiesAndTeam();
  }, [loadActivitiesAndTeam]);

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
        await loadActivitiesAndTeam();
      }
    } catch {
      toast.error("Failed to update activity");
    }
  };

  // Filter activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      // User filter
      if (selectedUserId && act.user_id !== selectedUserId) return false;

      // Status filter
      if (statusFilter === "today") {
        if (!act.scheduled_at) return false;
        return isToday(new Date(act.scheduled_at));
      }
      if (statusFilter === "overdue") {
        if (!act.scheduled_at || act.status !== "pending") return false;
        return isPast(new Date(act.scheduled_at)) && !isToday(new Date(act.scheduled_at));
      }
      if (statusFilter === "pending" && act.status !== "pending") return false;
      if (statusFilter === "completed" && act.status !== "completed") return false;

      return true;
    });
  }, [activities, selectedUserId, statusFilter]);

  // Calendar days
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  return (
    <div className="space-y-6">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="size-5 text-primary" />
            Schedule & Meetings Hub
          </h2>
          <p className="text-xs text-muted-foreground">
            View scheduled calls, Google Meet client sessions, and follow-ups across your team.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Team Member Sorting / Filter */}
          <div className="flex items-center gap-1">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary font-medium"
            >
              <option value="">👥 All Team Members</option>
              {teamMembers.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  👤 {tm.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Quick Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="all">All Statuses</option>
            <option value="today">Today&apos;s Schedule</option>
            <option value="overdue">Overdue Activities</option>
            <option value="pending">Pending Only</option>
            <option value="completed">Completed</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
            <button
              type="button"
              onClick={() => setViewMode("row")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === "row"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="size-3.5" />
              Row View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === "calendar"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarIcon className="size-3.5" />
              Calendar View
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : viewMode === "row" ? (
        /* ROW / LIST VIEW */
        filteredActivities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-2">
            <CheckCircle2 className="size-8 text-emerald-400 mx-auto" />
            <h3 className="text-sm font-semibold text-foreground">No Scheduled Activities</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No meetings or calls match your current filter. Schedule a call or Google Meet directly from any lead workspace.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredActivities.map((act) => {
              const isCall = act.type === "call";
              const isMeet = act.type === "meeting" || act.type === "google_meet";
              const isPending = act.status === "pending";
              const isOverdue =
                isPending && act.scheduled_at && isPast(new Date(act.scheduled_at)) && !isToday(new Date(act.scheduled_at));

              return (
                <div
                  key={act.id}
                  className={`rounded-2xl border p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card transition-all hover:border-primary/40 ${
                    isOverdue ? "border-red-500/40 bg-red-500/5" : "border-border"
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-xl bg-muted text-foreground">
                        {isCall && <Phone className="size-4 text-emerald-400" />}
                        {isMeet && <Video className="size-4 text-blue-400" />}
                        {!isCall && !isMeet && <Clock className="size-4 text-amber-400" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{act.title}</span>
                          {isPending ? (
                            <Badge
                              variant="outline"
                              className={
                                isOverdue
                                  ? "border-red-500/40 text-red-400 bg-red-500/10 text-[10px]"
                                  : "border-primary/40 text-primary bg-primary/10 text-[10px]"
                              }
                            >
                              {isOverdue ? "OVERDUE" : "PENDING"}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                            >
                              COMPLETED
                            </Badge>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-3 mt-0.5">
                          {act.scheduled_at && (
                            <span className="flex items-center gap-1 font-mono text-foreground font-medium">
                              <CalendarIcon className="size-3 text-primary" />
                              {format(new Date(act.scheduled_at), "EEE, MMM d, yyyy 'at' h:mm a")}
                            </span>
                          )}

                          {act.contact && (
                            <span>
                              Client: <strong>{act.contact.name || act.contact.phone}</strong>
                            </span>
                          )}

                          {act.deal && (
                            <span>
                              Deal: <strong className="text-primary">{act.deal.title}</strong> ({act.deal.currency || "$"}{Number(act.deal.value || 0).toLocaleString()})
                            </span>
                          )}

                          {act.user && (
                            <span>
                              Agent: <strong>{act.user.full_name || act.user.email}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {act.call_notes && (
                      <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2 mt-2">
                        <strong>Notes:</strong> {act.call_notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {act.google_meet_url && (
                      <a
                        href={act.google_meet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        <Video className="size-3.5" />
                        Join Google Meet
                        <ExternalLink className="size-3" />
                      </a>
                    )}

                    {act.deal_id && onSelectDeal && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSelectDeal(act.deal_id!)}
                        className="h-8 text-xs border-border text-foreground hover:bg-muted"
                      >
                        Open Lead
                      </Button>
                    )}

                    {isPending && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMarkComplete(act.id)}
                        className="h-8 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      >
                        <CheckCircle2 className="size-3.5 mr-1" />
                        Complete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* CALENDAR MONTH/WEEK VIEW */
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
          {/* Month Header Navigation */}
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="text-base font-bold text-foreground">
              {format(currentDate, "MMMM yyyy")}
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(subDays(currentDate, 30))}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date())}
                className="h-8 text-xs px-2.5"
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(addDays(currentDate, 30))}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
            <div>Sun</div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((day, idx) => {
              const dayActivities = filteredActivities.filter(
                (act) => act.scheduled_at && isSameDay(new Date(act.scheduled_at), day)
              );
              const isTodayCell = isToday(day);

              return (
                <div
                  key={idx}
                  className={`min-h-28 rounded-xl border p-2 text-xs flex flex-col justify-between transition-all ${
                    isTodayCell
                      ? "border-primary bg-primary/5"
                      : "border-border/60 bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono">
                    <span
                      className={`size-6 flex items-center justify-center rounded-full text-xs ${
                        isTodayCell
                          ? "bg-primary text-primary-foreground font-bold"
                          : "text-foreground font-semibold"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {dayActivities.length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        {dayActivities.length} evt
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mt-1 flex-1 overflow-hidden">
                    {dayActivities.slice(0, 3).map((act) => {
                      const isMeet = act.type === "meeting" || act.type === "google_meet";

                      return (
                        <div
                          key={act.id}
                          onClick={() => act.deal_id && onSelectDeal && onSelectDeal(act.deal_id)}
                          className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium cursor-pointer flex items-center gap-1 ${
                            isMeet
                              ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                              : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                          }`}
                        >
                          {isMeet ? <Video className="size-2.5 shrink-0" /> : <Phone className="size-2.5 shrink-0" />}
                          <span className="truncate">{act.title}</span>
                        </div>
                      );
                    })}
                    {dayActivities.length > 3 && (
                      <div className="text-[10px] text-muted-foreground font-medium pl-1">
                        +{dayActivities.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
