"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  MessageSquare,
  Sparkles,
  Info,
  Check,
  ChevronRight,
  Flame,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/lib/supabase/client";
import { CallOutcomeModal, ScheduleMeetingModal, ScheduleFollowUpModal } from "./activity-modals";
import { WonReasonModal, LostReasonModal } from "./won-lost-modals";
import { EditDealModal } from "./edit-deal-modal";
import { ArchiveWonModal } from "./archive-won-modal";
import type { Deal, CrmActivity, PipelineStage } from "@/types";

interface DealDetailWorkspaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string | null;
  initialDeal?: Deal | null;
  stages: PipelineStage[];
  onDealUpdated: () => void;
}

export function DealDetailWorkspace({
  open,
  onOpenChange,
  dealId,
  initialDeal,
  stages,
  onDealUpdated,
}: DealDetailWorkspaceProps) {
  const [deal, setDeal] = useState<Deal | null>(initialDeal || null);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(!initialDeal);
  const [activeTab, setActiveTab] = useState<"timeline" | "scope" | "contact">("timeline");
  const [newNoteText, setNewNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [archiveWonModalOpen, setArchiveWonModalOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [wonModalOpen, setWonModalOpen] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync initialDeal instantly when drawer opens
  useEffect(() => {
    if (initialDeal) {
      setDeal(initialDeal);
      setLoading(false);
    }
  }, [initialDeal]);

  const loadDealAndTimeline = useCallback(async () => {
    if (!dealId) return;
    if (!initialDeal && !deal) {
      setLoading(true);
    }
    try {
      const supabase = createClient();
      const [dealRes, actRes] = await Promise.all([
        supabase
          .from("deals")
          .select("*, contact:contacts(*), stage:pipeline_stages(*)")
          .eq("id", dealId)
          .maybeSingle(),
        fetch(`/api/crm/activities?deal_id=${dealId}&limit=50`, { cache: "no-store" }),
      ]);

      if (dealRes.data) {
        setDeal(dealRes.data as Deal);
      }
      const actData = await actRes.json().catch(() => ({}));
      if (actRes.ok && Array.isArray(actData.activities)) {
        setActivities(actData.activities);
      }
    } catch (err) {
      console.error("Failed to load deal timeline:", err);
    } finally {
      setLoading(false);
    }
  }, [dealId, initialDeal, deal]);

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

  const handleDeleteDeal = async () => {
    if (!deal) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("deals").delete().eq("id", deal.id);
      if (error) {
        toast.error("Failed to delete deal: " + error.message);
        return;
      }
      toast.success("Deal deleted successfully from CRM");
      onOpenChange(false);
      onDealUpdated();
    } catch {
      toast.error("An error occurred while deleting deal");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const currentStatus = deal?.status || "open";
  const sortedStages = [...stages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const currentStageIndex = sortedStages.findIndex((s) => s.id === deal?.stage_id);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:w-[50vw] sm:max-w-[50vw] md:max-w-[50vw] lg:max-w-[50vw] data-[side=right]:sm:max-w-[50vw] data-[side=right]:w-[50vw] bg-card border-border p-0 flex flex-col h-full shadow-2xl">
          {loading || !deal ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Top Banner & Client Header Card */}
              <div className="p-6 pr-14 border-b border-border bg-gradient-to-b from-muted/50 to-card space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Deal Title & Contact Identity */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                        {deal.title}
                      </h2>
                      {currentStatus === "won" && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs px-2.5 py-0.5">
                          🏆 WON DEAL
                        </Badge>
                      )}
                      {currentStatus === "lost" && (
                        <Badge className="bg-red-500/20 text-red-400 border border-red-500/40 text-xs px-2.5 py-0.5">
                          ❌ LOST DEAL
                        </Badge>
                      )}
                      {currentStatus === "open" && (
                        <Badge className="bg-primary/20 text-primary border border-primary/40 text-xs px-2.5 py-0.5">
                          ACTIVE DEAL
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5 text-foreground font-medium">
                        <User className="size-3.5 text-primary" />
                        {deal.contact?.name || "No Contact"}
                        {deal.contact?.phone && (
                          <span className="font-mono text-muted-foreground">({deal.contact.phone})</span>
                        )}
                      </span>

                      {deal.contact?.phone && (
                        <div className="flex items-center gap-1.5 py-0.5">
                          <a
                            href={`tel:${deal.contact.phone.replace(/\s+/g, "")}`}
                            title="Call client (PC/Phone dialer)"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30 transition-colors shadow-sm"
                          >
                            <Phone className="size-3" />
                            Call
                          </a>
                          <a
                            href={`sms:${deal.contact.phone.replace(/\s+/g, "")}`}
                            title="Send SMS / Message"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 transition-colors shadow-sm"
                          >
                            <MessageSquare className="size-3" />
                            Message
                          </a>
                          <a
                            href={`https://web.whatsapp.com/send?phone=${deal.contact.phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in WhatsApp Web"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
                          >
                            <Send className="size-3" />
                            WhatsApp ↗
                          </a>
                        </div>
                      )}

                      {deal.assignee && (
                        <span className="flex items-center gap-1">
                          👤 Owner: <strong className="text-foreground">{deal.assignee.full_name || deal.assignee.email}</strong>
                        </span>
                      )}

                      {deal.expected_close_date && (
                        <span className="flex items-center gap-1 font-mono">
                          📅 Expected Close: {deal.expected_close_date}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Value Banner & Edit Offer Button */}
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-right shadow-sm w-full">
                      <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
                        {deal.currency || "$"}{Number(deal.value || 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">
                        Offer Value
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditModalOpen(true)}
                      className="h-7 px-3 text-xs gap-1.5 border-border bg-card text-foreground hover:bg-muted shadow-sm"
                    >
                      <Pencil className="size-3 text-primary" />
                      Edit Offer
                    </Button>
                  </div>
                </div>

                {/* Interactive Chevron Pipeline Stepper */}
                <div className="pt-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Flame className="size-3 text-primary" />
                    Deal Stage Progression
                  </div>
                  <div className="flex flex-wrap sm:flex-nowrap gap-1.5 bg-muted/60 p-1.5 rounded-xl border border-border overflow-x-auto">
                    {sortedStages.map((stg, idx) => {
                      const isCurrent = deal.stage_id === stg.id;
                      const isPassed = currentStageIndex > idx;

                      return (
                        <button
                          key={stg.id}
                          type="button"
                          onClick={() => handleStageChange(stg.id)}
                          className={`flex flex-1 items-center justify-center gap-1.5 min-w-[90px] px-3 py-2 text-xs font-semibold rounded-lg transition-all text-center ${
                            isCurrent
                              ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/40 font-bold scale-[1.02]"
                              : isPassed
                              ? "bg-muted text-foreground/80 hover:bg-muted/90"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`}
                        >
                          {isPassed && <Check className="size-3 text-emerald-400 shrink-0" />}
                          <span className="whitespace-nowrap truncate">{stg.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Follow-up Alert Box (if set) */}
                {deal.next_follow_up_at && (
                  <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 shrink-0" />
                      <span>
                        Next Follow-Up: <strong>{format(new Date(deal.next_follow_up_at), "MMM d, yyyy 'at' h:mm a")}</strong>
                      </span>
                    </div>
                    <span className="text-[11px] opacity-80">
                      ({formatDistanceToNow(new Date(deal.next_follow_up_at), { addSuffix: true })})
                    </span>
                  </div>
                )}

                {/* Quick Action Command Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setCallModalOpen(true)}
                      className="h-8.5 gap-1.5 text-xs bg-emerald-600/90 text-white hover:bg-emerald-600 shadow-sm"
                    >
                      <Phone className="size-3.5" />
                      Log / Schedule Call
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setFollowUpModalOpen(true)}
                      className="h-8.5 gap-1.5 text-xs bg-purple-600/90 text-white hover:bg-purple-600 shadow-sm"
                    >
                      <Sparkles className="size-3.5" />
                      Schedule Follow-up
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setMeetingModalOpen(true)}
                      className="h-8.5 gap-1.5 text-xs bg-blue-600/90 text-white hover:bg-blue-600 shadow-sm"
                    >
                      <Video className="size-3.5" />
                      Schedule Google Meet
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditModalOpen(true)}
                      className="h-8.5 gap-1.5 text-xs border-border bg-card text-foreground hover:bg-muted shadow-sm"
                    >
                      <Pencil className="size-3.5 text-primary" />
                      Edit Details
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentStatus === "open" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => setArchiveWonModalOpen(true)}
                          className="h-8.5 gap-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm font-semibold"
                          title="Finalize & Archive this deal to Won Deals and send Purchase conversion to Meta Pixel"
                        >
                          <Trophy className="size-3.5" />
                          Archive to Won Deals
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLostModalOpen(true)}
                          className="h-8.5 gap-1.5 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                        >
                          <XCircle className="size-3.5" />
                          Mark Lost
                        </Button>
                      </>
                    )}

                    {currentStatus !== "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleReopenDeal}
                        className="h-8.5 gap-1.5 text-xs border-border text-foreground hover:bg-muted"
                      >
                        Re-open Deal
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="h-8.5 gap-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      title="Delete Offer / Deal"
                    >
                      <Trash2 className="size-3.5" />
                      Delete Deal
                    </Button>
                  </div>
                </div>
              </div>

              {/* Navigation Sub-Tabs */}
              <div className="flex items-center gap-4 px-6 border-b border-border bg-card">
                <button
                  type="button"
                  onClick={() => setActiveTab("timeline")}
                  className={`py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === "timeline"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Clock className="size-3.5" />
                  Activity Timeline ({activities.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("scope")}
                  className={`py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === "scope"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="size-3.5" />
                  Deal Scope & Deliverables
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("contact")}
                  className={`py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === "contact"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <User className="size-3.5" />
                  Client & Chat
                </button>
              </div>

              {/* Tab Content Area */}
              <ScrollArea className="flex-1 p-6">
                {activeTab === "timeline" && (
                  <div className="space-y-6">
                    {/* Quick Add Note Box */}
                    <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <StickyNote className="size-3.5 text-primary" />
                        Quick Note / Lead Log
                      </div>
                      <textarea
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        placeholder="Type any sales notes, client feedback, or update to record on timeline..."
                        rows={2}
                        className="w-full bg-card border border-border rounded-xl p-3 text-xs text-foreground outline-none focus:border-primary transition-all"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleAddQuickNote}
                          disabled={addingNote || !newNoteText.trim()}
                          className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                        >
                          {addingNote ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                          Post Note
                        </Button>
                      </div>
                    </div>

                    {/* Timeline Stream */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Chronological History
                      </h4>

                      {activities.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2 bg-card">
                          <Clock className="size-8 text-muted-foreground mx-auto" />
                          <p className="text-xs text-muted-foreground">
                            No activities logged yet. Schedule a call, meeting, or add a note above to start tracking.
                          </p>
                        </div>
                      ) : (
                        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                          {activities.map((act) => {
                            const isCall = act.type === "call";
                            const isMeet = act.type === "meeting" || act.type === "google_meet";
                            const isStage = act.type === "stage_change";
                            const isNote = act.type === "note";

                            return (
                              <div key={act.id} className="relative group">
                                <div className="absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full bg-card border-2 border-primary text-primary shadow-sm">
                                  {isCall && <Phone className="size-2.5" />}
                                  {isMeet && <Video className="size-2.5" />}
                                  {isStage && <ArrowRight className="size-2.5" />}
                                  {isNote && <StickyNote className="size-2.5" />}
                                </div>

                                <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-sm group-hover:border-primary/40 transition-colors">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-foreground">{act.title}</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      {format(new Date(act.created_at), "MMM d, h:mm a")}
                                    </span>
                                  </div>

                                  {act.description && (
                                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                      {act.description}
                                    </p>
                                  )}

                                  {act.call_outcome && (
                                    <div className="flex items-center gap-2 pt-1">
                                      <Badge variant="outline" className="text-[10px] bg-muted capitalize">
                                        Outcome: {act.call_outcome.replace("_", " ")}
                                      </Badge>
                                      {act.call_notes && (
                                        <span className="text-xs text-muted-foreground italic">
                                          &quot;{act.call_notes}&quot;
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {act.google_meet_url && (
                                    <div className="pt-2">
                                      <a
                                        href={act.google_meet_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                      >
                                        <Video className="size-3.5" />
                                        Join Google Meet Video Session
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
                )}

                {activeTab === "scope" && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Sparkles className="size-4 text-amber-400" />
                        Deal Description & Scope of Deliverables
                      </h4>
                      {deal.description ? (
                        <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 p-4 rounded-xl border border-border">
                          {deal.description}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          No description provided when creating this deal.
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Deal Specifications
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Deal Value:</span>
                          <strong className="text-emerald-400 font-mono text-sm">
                            {deal.currency || "$"}{Number(deal.value || 0).toLocaleString()}
                          </strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Lead Source:</span>
                          <strong className="text-foreground">{deal.source || "Direct / WhatsApp"}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Expected Close Date:</span>
                          <strong className="text-foreground font-mono">{deal.expected_close_date || "Not set"}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Current Stage:</span>
                          <strong className="text-primary">{deal.stage?.name || "Active"}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "contact" && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Contact Information
                        </h4>
                        {deal.contact?.phone && (
                          <div className="flex items-center gap-2">
                            <a
                              href={`tel:${deal.contact.phone.replace(/\s+/g, "")}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30 transition-colors shadow-sm"
                            >
                              <Phone className="size-3.5" />
                              Call
                            </a>
                            <a
                              href={`sms:${deal.contact.phone.replace(/\s+/g, "")}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 transition-colors shadow-sm"
                            >
                              <MessageSquare className="size-3.5" />
                              Message
                            </a>
                            <a
                              href={`https://web.whatsapp.com/send?phone=${deal.contact.phone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
                            >
                              <Send className="size-3.5" />
                              WhatsApp ↗
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="rounded-xl bg-muted/40 p-3 border border-border">
                          <span className="text-muted-foreground block mb-1">Full Name</span>
                          <strong className="text-foreground text-sm">{deal.contact?.name || "Unnamed Contact"}</strong>
                        </div>

                        <div className="rounded-xl bg-muted/40 p-3 border border-border">
                          <span className="text-muted-foreground block mb-1">Phone Number</span>
                          <strong className="text-foreground font-mono text-sm">{deal.contact?.phone || "No phone"}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Activity Modals */}
      {deal && (
        <>
          <EditDealModal
            open={editModalOpen}
            onOpenChange={setEditModalOpen}
            deal={deal}
            stages={stages}
            onSaved={() => {
              void loadDealAndTimeline();
              onDealUpdated();
            }}
          />

          <ArchiveWonModal
            open={archiveWonModalOpen}
            onOpenChange={setArchiveWonModalOpen}
            deal={deal}
            onSuccess={() => {
              onOpenChange(false);
              onDealUpdated();
            }}
          />

          <CallOutcomeModal
            open={callModalOpen}
            onOpenChange={setCallModalOpen}
            deal={deal}
            onSuccess={loadDealAndTimeline}
          />

          <ScheduleMeetingModal
            open={meetingModalOpen}
            onOpenChange={setMeetingModalOpen}
            deal={deal}
            onSuccess={loadDealAndTimeline}
          />

          <ScheduleFollowUpModal
            open={followUpModalOpen}
            onOpenChange={setFollowUpModalOpen}
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

          <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <DialogContent className="sm:max-w-sm bg-card border-border">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-400">
                  <Trash2 className="size-5" />
                  Delete Offer / Deal
                </DialogTitle>
              </DialogHeader>
              <div className="py-2 text-xs text-muted-foreground">
                <p className="text-foreground font-medium mb-1">
                  Are you sure you want to delete <strong className="text-red-400">"{deal.title}"</strong>?
                </p>
                <p>This action will permanently delete this deal record and remove it from your CRM pipeline.</p>
              </div>
              <DialogFooter className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleDeleteDeal}
                  disabled={deleting}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {deleting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : "Delete Deal"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
