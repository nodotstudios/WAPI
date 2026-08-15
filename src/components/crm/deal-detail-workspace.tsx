"use client";

import { useState, useEffect, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  X,
  Phone,
  Calendar,
  Video,
  StickyNote,
  DollarSign,
  User,
  Clock,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Trophy,
  Loader2,
  ArrowRight,
  Plus,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/lib/supabase/client";
import { CallOutcomeModal } from "./activity-modals";
import { ScheduleMeetingModal } from "./activity-modals";
import { WonReasonModal, LostReasonModal } from "./won-lost-modals";
import type { Deal, CrmActivity, PipelineStage } from "@/types";

interface DealDetailWorkspaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string | null;
  stages: PipelineStage[];
  onDealUpdated: () => void;
}

export function DealDetailWorkspace({
  open,
  onOpenChange,
  dealId,
  stages,
  onDealUpdated,
}: DealDetailWorkspaceProps) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNoteText, setNewNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Modals
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [wonModalOpen, setWonModalOpen] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);

  const loadDealAndTimeline = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const [dealRes, actRes] = await Promise.all([
        supabase
          .from("deals")
          .select("*, contact:contacts(*), stage:pipeline_stages(*), assignee:profiles!deals_assigned_to_fkey(*)")
          .eq("id", dealId)
          .single(),
        fetch(`/api/crm/activities?deal_id=${dealId}&limit=50`, { cache: "no-store" }),
      ]);

      if (dealRes.data) {
        setDeal(dealRes.data as Deal);
      }
      const actData = await actRes.json().catch(() => ({}));
      if (actRes.ok && Array.isArray(actData.activities)) {
        setActivities(actData.activities);
      }
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (open && dealId) {
      void loadDealAndTimeline();
    }
  }, [open, dealId, loadDealAndTimeline]);

  const handleAddQuickNote = async () => {
    if (!deal || !newNoteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          type: "note",
          title: "Note Added",
          description: newNoteText.trim(),
          status: "completed",
        }),
      });
      if (res.ok) {
        setNewNoteText("");
        toast.success("Note saved to deal timeline");
        await loadDealAndTimeline();
      }
    } finally {
      setAddingNote(false);
    }
  };

  const handleStageChange = async (targetStageId: string) => {
    if (!deal || deal.stage_id === targetStageId) return;
    const targetStage = stages.find((s) => s.id === targetStageId);
    if (!targetStage) return;

    try {
      const supabase = createClient();
      await supabase
        .from("deals")
        .update({ stage_id: targetStageId, updated_at: new Date().toISOString() })
        .eq("id", deal.id);

      // Record stage transition
      await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          type: "stage_change",
          title: `Moved to "${targetStage.name}" stage`,
          status: "completed",
        }),
      });

      toast.success(`Deal moved to "${targetStage.name}" stage`);
      await loadDealAndTimeline();
      onDealUpdated();
    } catch {
      toast.error("Failed to update stage");
    }
  };

  const handleReopenDeal = async () => {
    if (!deal) return;
    try {
      const supabase = createClient();
      await supabase
        .from("deals")
        .update({
          status: "open",
          won_at: null,
          lost_at: null,
          won_reason: null,
          lost_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deal.id);

      toast.success("Deal reopened and returned to active pipeline!");
      await loadDealAndTimeline();
      onDealUpdated();
    } catch {
      toast.error("Failed to reopen deal");
    }
  };

  const currentStatus = deal?.status || "open";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl md:max-w-2xl bg-card border-border p-0 flex flex-col h-full">
          {loading || !deal ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-6 border-b border-border bg-muted/20 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-foreground">{deal.title}</span>
                      {currentStatus === "won" && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          🏆 WON
                        </Badge>
                      )}
                      {currentStatus === "lost" && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                          ❌ LOST
                        </Badge>
                      )}
                      {currentStatus === "open" && (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                          ACTIVE
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      Client: <strong className="text-foreground">{deal.contact?.name || deal.contact?.phone || "No Contact"}</strong>
                      {deal.contact?.phone && <span className="ml-2 font-mono">({deal.contact.phone})</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-emerald-400">
                      {deal.currency || "$"} {Number(deal.value || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">Deal Value</div>
                  </div>
                </div>

                {/* Stage Stepper / Dropdown */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2">
                  {stages.map((stg) => {
                    const isCurrent = stg.id === deal.stage_id;
                    return (
                      <button
                        key={stg.id}
                        type="button"
                        onClick={() => handleStageChange(stg.id)}
                        className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
                          isCurrent
                            ? "bg-primary text-primary-foreground shadow-sm scale-105"
                            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        }`}
                      >
                        {stg.name}
                      </button>
                    );
                  })}
                </div>

                {/* Next Follow-up Banner if set */}
                {deal.next_follow_up_at && (
                  <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4" />
                      <span>
                        Next Follow-Up: <strong>{format(new Date(deal.next_follow_up_at), "MMM d, yyyy 'at' h:mm a")}</strong>
                      </span>
                    </div>
                    <span className="text-[11px] opacity-80">
                      ({formatDistanceToNow(new Date(deal.next_follow_up_at), { addSuffix: true })})
                    </span>
                  </div>
                )}

                {/* Action Buttons Toolbar */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCallModalOpen(true)}
                    className="h-8 gap-1.5 text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  >
                    <Phone className="size-3.5" />
                    Log / Schedule Call
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMeetingModalOpen(true)}
                    className="h-8 gap-1.5 text-xs border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                  >
                    <Video className="size-3.5" />
                    Schedule Google Meet
                  </Button>

                  {currentStatus === "open" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setWonModalOpen(true)}
                        className="h-8 gap-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 ml-auto"
                      >
                        <Trophy className="size-3.5" />
                        Mark as Won
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLostModalOpen(true)}
                        className="h-8 gap-1.5 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        <XCircle className="size-3.5" />
                        Mark as Lost
                      </Button>
                    </>
                  )}

                  {currentStatus !== "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleReopenDeal}
                      className="h-8 gap-1.5 text-xs border-border text-foreground hover:bg-muted ml-auto"
                    >
                      Reopen Deal to Active
                    </Button>
                  )}
                </div>
              </div>

              {/* Main Content: Timeline & Details */}
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-6">
                  {/* Quick Add Note Box */}
                  <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                    <textarea
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Add an update or note to this lead timeline..."
                      rows={2}
                      className="w-full bg-background border border-border rounded-md p-2 text-xs text-foreground outline-none focus:border-primary"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleAddQuickNote}
                        disabled={addingNote || !newNoteText.trim()}
                        className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {addingNote ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5 mr-1" />}
                        Post Note
                      </Button>
                    </div>
                  </div>

                  {/* Unified Chronological Activity Timeline */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Activity & History Timeline
                    </h4>

                    {activities.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                        No activities logged yet. Schedule a call or meeting above to start tracking!
                      </div>
                    ) : (
                      <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                        {activities.map((act) => {
                          const isCall = act.type === "call";
                          const isMeet = act.type === "meeting" || act.type === "google_meet";
                          const isStage = act.type === "stage_change";

                          return (
                            <div key={act.id} className="relative group">
                              {/* Icon Bubble */}
                              <div className="absolute -left-6 top-0.5 flex size-4.5 items-center justify-center rounded-full bg-background border border-border text-foreground">
                                {isCall && <Phone className="size-2.5 text-emerald-400" />}
                                {isMeet && <Video className="size-2.5 text-blue-400" />}
                                {isStage && <ArrowRight className="size-2.5 text-purple-400" />}
                                {!isCall && !isMeet && !isStage && <StickyNote className="size-2.5 text-amber-400" />}
                              </div>

                              <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-sm space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-foreground">{act.title}</span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {format(new Date(act.created_at), "MMM d, h:mm a")}
                                  </span>
                                </div>

                                {act.description && (
                                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                    {act.description}
                                  </p>
                                )}

                                {act.call_notes && (
                                  <div className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                                    <strong>Call Notes:</strong> {act.call_notes}
                                  </div>
                                )}

                                {act.google_meet_url && (
                                  <div className="pt-1 flex items-center gap-2">
                                    <a
                                      href={act.google_meet_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                    >
                                      <Video className="size-3.5" />
                                      Join Google Meet
                                      <ExternalLink className="size-3" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Sub-modals */}
      <CallOutcomeModal
        open={callModalOpen}
        onOpenChange={setCallModalOpen}
        deal={deal}
        onSuccess={() => {
          void loadDealAndTimeline();
          onDealUpdated();
        }}
      />
      <ScheduleMeetingModal
        open={meetingModalOpen}
        onOpenChange={setMeetingModalOpen}
        deal={deal}
        onSuccess={() => {
          void loadDealAndTimeline();
          onDealUpdated();
        }}
      />
      <WonReasonModal
        open={wonModalOpen}
        onOpenChange={setWonModalOpen}
        deal={deal}
        onSuccess={() => {
          void loadDealAndTimeline();
          onDealUpdated();
        }}
      />
      <LostReasonModal
        open={lostModalOpen}
        onOpenChange={setLostModalOpen}
        deal={deal}
        onSuccess={() => {
          void loadDealAndTimeline();
          onDealUpdated();
        }}
      />
    </>
  );
}
