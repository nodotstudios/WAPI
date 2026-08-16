"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, Calendar, Video, StickyNote, Loader2, Clock, MessageSquare, Send } from "lucide-react";
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
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
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

export function ModernDateTimePicker({
  value,
  onChange,
  label = "Date & Time",
}: {
  value: string;
  onChange: (isoString: string) => void;
  label?: string;
}) {
  // Parsed initial date & time values
  const dateObj = value ? new Date(value) : new Date();
  
  const formatDateForInput = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatTimeForInput = (d: Date) => {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const [selectedDate, setSelectedDate] = useState(formatDateForInput(dateObj));
  const [selectedTime, setSelectedTime] = useState(formatTimeForInput(dateObj));

  const updateCombined = (dStr: string, tStr: string) => {
    setSelectedDate(dStr);
    setSelectedTime(tStr);
    if (dStr && tStr) {
      try {
        const combined = new Date(`${dStr}T${tStr}:00`).toISOString();
        onChange(combined);
      } catch {
        // Fallback
      }
    }
  };

  const setShortcut = (daysToAdd: number, timeStr = "10:00") => {
    const target = new Date();
    target.setDate(target.getDate() + daysToAdd);
    const dStr = formatDateForInput(target);
    updateCombined(dStr, timeStr);
  };

  const timeSlots = [
    { label: "09:00 AM", value: "09:00" },
    { label: "10:00 AM", value: "10:00" },
    { label: "11:00 AM", value: "11:00" },
    { label: "01:00 PM", value: "13:00" },
    { label: "02:00 PM", value: "14:00" },
    { label: "03:00 PM", value: "15:00" },
    { label: "04:00 PM", value: "16:00" },
    { label: "05:00 PM", value: "17:00" },
  ];

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </label>

      {/* Quick Date Chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setShortcut(0, selectedTime)}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border bg-muted hover:bg-primary/20 hover:border-primary/40 hover:text-primary transition-all"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => setShortcut(1, selectedTime)}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border bg-muted hover:bg-primary/20 hover:border-primary/40 hover:text-primary transition-all"
        >
          Tomorrow
        </button>
        <button
          type="button"
          onClick={() => setShortcut(2, selectedTime)}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border bg-muted hover:bg-primary/20 hover:border-primary/40 hover:text-primary transition-all"
        >
          In 2 Days
        </button>
        <button
          type="button"
          onClick={() => setShortcut(7, selectedTime)}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border bg-muted hover:bg-primary/20 hover:border-primary/40 hover:text-primary transition-all"
        >
          Next Week
        </button>
      </div>

      {/* Modern Split Date & Time Inputs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => updateCombined(e.target.value, selectedTime)}
            className="bg-muted text-foreground border-border text-xs rounded-xl h-10 shadow-xs focus:border-primary"
          />
        </div>
        <div>
          <select
            value={selectedTime}
            onChange={(e) => updateCombined(selectedDate, e.target.value)}
            className="flex h-10 w-full rounded-xl border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          >
            {timeSlots.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export function ScheduleMeetingModal({ open, onOpenChange, deal, onSuccess }: ScheduleMeetingModalProps) {
  const [title, setTitle] = useState(deal ? `Meeting with ${deal.contact?.name || deal.title}` : "Client Meeting");
  const [dateTime, setDateTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString();
  });
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
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          type: createMeet ? "google_meet" : "meeting",
          title: title.trim(),
          description: description.trim() || null,
          scheduled_at: dateTime,
          duration_minutes: parseInt(duration, 10) || 30,
          status: "pending",
          next_follow_up_at: dateTime,
          create_google_event: createMeet,
          attendee_email: attendeeEmail.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error || "Failed to schedule meeting");
        return;
      }

      toast.success(
        createMeet
          ? "Meeting scheduled & Google Meet link generated!"
          : "Meeting scheduled on CRM timeline!"
      );
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("An error occurred while scheduling");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground text-lg">
            <Calendar className="size-5 text-primary" />
            Schedule Meeting / Google Meet
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Meeting Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Product Demo & Proposal Discussion"
              className="bg-muted text-foreground border-border text-sm rounded-xl h-10"
            />
          </div>

          <ModernDateTimePicker
            value={dateTime}
            onChange={(iso) => setDateTime(iso)}
            label="Meeting Date & Time"
          />

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="flex h-10 w-full rounded-xl border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Client Email (for Calendar invite)
            </label>
            <Input
              type="email"
              value={attendeeEmail}
              onChange={(e) => setAttendeeEmail(e.target.value)}
              placeholder="client@company.com"
              className="bg-muted text-foreground border-border text-sm rounded-xl h-10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Agenda & Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Meeting agenda, discussion topics..."
              rows={2}
              className="w-full rounded-xl border border-border bg-muted p-2.5 text-xs text-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3.5 text-xs text-foreground">
            <Video className="size-5 shrink-0 text-primary" />
            <div className="flex-1">
              <strong className="text-foreground font-semibold">Generate Google Meet Link</strong>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Creates event in Google Calendar and generates video meet link automatically.
              </p>
            </div>
            <input
              type="checkbox"
              checked={createMeet}
              onChange={(e) => setCreateMeet(e.target.checked)}
              className="size-4 rounded border-border accent-primary cursor-pointer"
            />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving || !title.trim() || !dateTime}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
          >
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : "Schedule Meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleFollowUpModal({
  open,
  onOpenChange,
  deal,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  onSuccess: () => void;
}) {
  const [channel, setChannel] = useState<"chat" | "call" | "meeting">("chat");
  const [title, setTitle] = useState(
    deal ? `Follow-up with ${deal.contact?.name || deal.title}` : "Client Follow-up"
  );
  const [dateTime, setDateTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return d.toISOString();
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!deal || !dateTime) {
      toast.error("Please select a follow-up date and time");
      return;
    }
    setSaving(true);
    try {
      const typeStr = channel === "chat" ? "chat_followup" : channel === "call" ? "call_followup" : "meeting_followup";
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          type: typeStr,
          title: title.trim(),
          description: notes.trim() || null,
          scheduled_at: dateTime,
          status: "pending",
          next_follow_up_at: dateTime,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error || "Failed to schedule follow-up");
        return;
      }

      toast.success(
        channel === "chat"
          ? "WhatsApp Chat follow-up scheduled!"
          : channel === "call"
          ? "Call follow-up scheduled!"
          : "Follow-up meeting scheduled!"
      );
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("An error occurred while scheduling follow-up");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground text-lg">
            <Clock className="size-5 text-primary" />
            Schedule Follow-up
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Channel selector */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Follow-up Channel
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setChannel("chat")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-medium transition-all ${
                  channel === "chat"
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 font-semibold"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                <MessageSquare className="size-4" />
                Chat / WA
              </button>

              <button
                type="button"
                onClick={() => setChannel("call")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-medium transition-all ${
                  channel === "call"
                    ? "border-primary bg-primary/15 text-primary font-semibold"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                <Phone className="size-4" />
                Phone Call
              </button>

              <button
                type="button"
                onClick={() => setChannel("meeting")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-medium transition-all ${
                  channel === "meeting"
                    ? "border-blue-500 bg-blue-500/15 text-blue-400 font-semibold"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                <Video className="size-4" />
                Meeting
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Follow-up Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Check proposal feedback via Chat"
              className="bg-muted text-foreground border-border text-sm rounded-xl h-10"
            />
          </div>

          <ModernDateTimePicker
            value={dateTime}
            onChange={(iso) => setDateTime(iso)}
            label="Scheduled Date & Time"
          />

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Follow-up Notes / Message Draft
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What to ask or message during follow-up..."
              rows={2}
              className="w-full rounded-xl border border-border bg-muted p-2.5 text-xs text-foreground outline-none focus:border-primary"
            />
          </div>

          {deal?.contact_id && channel === "chat" && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
              <MessageSquare className="size-4 shrink-0" />
              <span>When due, you will get 1-tap direct action to open chat in Inbox with pre-filled reminder!</span>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving || !title.trim() || !dateTime}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
          >
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : "Save Follow-up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
