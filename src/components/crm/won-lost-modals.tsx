"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Deal } from "@/types";

export const WON_REASONS = [
  "Converted",
  "Existing Customer",
  "Repeat Order",
  "Referral",
  "Special Promotion",
  "Other",
];

export const LOST_REASONS = [
  "Price Too High",
  "Competitor",
  "No Response",
  "Not Interested",
  "Budget Issue",
  "Timing / Delayed",
  "Wrong Requirement",
  "Duplicate Lead",
  "Invalid Lead",
  "Other",
];

interface WonReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  onSuccess: () => void;
}

export function WonReasonModal({ open, onOpenChange, deal, onSuccess }: WonReasonModalProps) {
  const [wonReason, setWonReason] = useState("Converted");
  const [value, setValue] = useState(deal?.value ? String(deal.value) : "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!deal) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const numValue = parseFloat(value) || deal.value || 0;
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("deals")
        .update({
          status: "won",
          won_at: now,
          won_reason: wonReason,
          value: numValue,
          last_activity_at: now,
          updated_at: now,
        })
        .eq("id", deal.id);

      if (error) {
        toast.error("Failed to mark deal as won: " + error.message);
        return;
      }

      // Record activity
      await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          type: "note",
          title: `🏆 Deal Won (${wonReason})`,
          description: `Deal closed won for ${deal.currency || "USD"} ${numValue.toLocaleString()}.${notes ? ` Notes: ${notes}` : ""}`,
          status: "completed",
        }),
      });

      toast.success(`🎉 Deal marked as WON! Moved to Won & Archive records.`);
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Failed to update deal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Trophy className="size-5 text-emerald-400" />
            Mark Deal as Won
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Won Reason
            </label>
            <select
              value={wonReason}
              onChange={(e) => setWonReason(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {WON_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Final Won Value ({deal?.currency || "USD"})
            </label>
            <Input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 1000.00"
              className="bg-muted text-foreground border-border text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Closing Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What made the client convert?"
              rows={2}
              className="w-full rounded-md border border-border bg-muted p-2 text-xs text-foreground outline-none focus:border-primary"
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
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : "Confirm Deal Won"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LostReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  onSuccess: () => void;
}

export function LostReasonModal({ open, onOpenChange, deal, onSuccess }: LostReasonModalProps) {
  const [lostReason, setLostReason] = useState("Price Too High");
  const [lostNotes, setLostNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!deal) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("deals")
        .update({
          status: "lost",
          lost_at: now,
          lost_reason: lostReason,
          lost_notes: lostNotes.trim() || null,
          last_activity_at: now,
          updated_at: now,
        })
        .eq("id", deal.id);

      if (error) {
        toast.error("Failed to mark deal as lost: " + error.message);
        return;
      }

      // Record activity
      await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          type: "note",
          title: `❌ Deal Lost (${lostReason})`,
          description: `Deal marked as lost. Reason: ${lostReason}.${lostNotes ? ` Notes: ${lostNotes}` : ""}`,
          status: "completed",
        }),
      });

      toast.success("Deal marked as Lost and archived into Historical Reports.");
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Failed to update deal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <XCircle className="size-5 text-red-400" />
            Mark Deal as Lost
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Reason for Loss <span className="text-red-400">*</span>
            </label>
            <select
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Lost Notes & Feedback
            </label>
            <textarea
              value={lostNotes}
              onChange={(e) => setLostNotes(e.target.value)}
              placeholder="Provide details on why this deal didn't close..."
              rows={3}
              className="w-full rounded-md border border-border bg-muted p-2 text-xs text-foreground outline-none focus:border-primary"
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
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : "Confirm Deal Lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
