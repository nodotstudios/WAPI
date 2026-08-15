"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, Calendar, Video, StickyNote, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Deal } from "@/types";

export const CALL_OUTCOMES = [
  { value: "completed", label: "Completed — Connected" },
  { value: "no_answer", label: "No Answer / Ringing" },
  { value: "busy", label: "Busy Line" },
  { value: "switched_off", label: "Switched Off / Unreachable" },
  { value: "wrong_number", label: "Wrong Number" },
  { value: "call_back_requested", label: "Call Back Requested" },
  { value: "customer_interested", label: "Customer Interested" },
  { value: "customer_not_interested", label: "Customer Not Interested" },
  { value: "follow_up_required", label: "Follow-up Required" },
  { value: "other", label: "Other" },
];

interface CallOutcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  onSuccess: () => void;
}

export function CallOutcomeModal({ open, onOpenChange, deal, onSuccess }: CallOutcomeModalProps) {
  const [outcome, setOutcome] = useState("completed");
  const [notes, setNotes] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!deal) return;
    setSaving(true);
    try {
      const outcomeLabel = CALL_OUTCOMES.find((o) => o.value === outcome)?.label || outcome;
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          type: "call",
          title: `📞 Call Logged (${outcomeLabel})`,
          call_outcome: outcome,
          call_notes: notes.trim() || null,
          status: "completed",
          next_follow_up_at: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
        }),
      });

      if (!res.ok) {
        toast.error("Failed to log call");
        return;
      }

      toast.success("Call outcome and follow-up logged to deal timeline!");
      onOpenChange(false);
      setNotes("");
      setNextFollowUp("");
      onSuccess();
    } catch {
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Phone className="size-5 text-emerald-400" />
            Log Call Outcome
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Call Outcome
            </label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {CALL_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              What was discussed? (Call Notes)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Summary of discussion, objections, budget, or next steps..."
              rows={3}
              className="w-full rounded-md border border-border bg-muted p-2 text-xs text-foreground outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" />
              Schedule Next Follow-Up (Optional)
            </label>
            <Input
              type="datetime-local"
              value={nextFollowUp}
              onChange={(e) => setNextFollowUp(e.target.value)}
              className="bg-muted text-foreground border-border text-sm"
            />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : "Save Call Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ScheduleMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  onSuccess: () => void;
}

export function ScheduleMeetingModal({ open, onOpenChange, deal, onSuccess }: ScheduleMeetingModalProps) {
  const [title, setTitle] = useState(deal ? `Meeting with ${deal.contact?.name || deal.title}` : "Client Meeting");
  const [dateTime, setDateTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [createMeet, setCreateMeet] = useState(true);
  const [description, setDescription] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState(deal?.contact?.email || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!deal || !dateTime) {
      toast.error("Please select a meeting date and time");
      return;
    }
    setSaving(true);
    try {
      const startIso = new Date(dateTime).toISOString();
      const attendees = attendeeEmail.trim() ? [attendeeEmail.trim()] : [];

      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          type: createMeet ? "google_meet" : "meeting",
          title: title.trim(),
          description: description.trim() || null,
          scheduled_at: startIso,
          duration_minutes: parseInt(duration, 10) || 30,
          status: "pending",
          next_follow_up_at: startIso,
        }),
      });

      if (!res.ok) {
        toast.error("Failed to schedule meeting");
        return;
      }

      toast.success(
        createMeet
          ? "Meeting scheduled! Activity added to CRM & Google Calendar."
          : "Meeting scheduled on CRM timeline!"
      );
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Calendar className="size-5 text-blue-400" />
            Schedule Meeting / Google Meet
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Meeting Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Product Demo & Proposal Discussion"
              className="bg-muted text-foreground border-border text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Date & Time
              </label>
              <Input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="bg-muted text-foreground border-border text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-muted px-2 py-2 text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Client Email (for Calendar invite)
            </label>
            <Input
              type="email"
              value={attendeeEmail}
              onChange={(e) => setAttendeeEmail(e.target.value)}
              placeholder="client@company.com"
              className="bg-muted text-foreground border-border text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Agenda & Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Meeting agenda, discussion topics..."
              rows={2}
              className="w-full rounded-md border border-border bg-muted p-2 text-xs text-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-300">
            <Video className="size-4 shrink-0 text-blue-400" />
            <div className="flex-1">
              <strong>Generate Google Meet Link</strong>
              <p className="text-[11px] text-muted-foreground">
                Creates event in Google Calendar and generates video meet link.
              </p>
            </div>
            <input
              type="checkbox"
              checked={createMeet}
              onChange={(e) => setCreateMeet(e.target.checked)}
              className="size-4 rounded border-border"
            />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving || !title.trim() || !dateTime}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : "Schedule Meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
