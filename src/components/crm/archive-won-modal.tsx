"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Trophy, DollarSign, ArrowRight, ShieldCheck } from "lucide-react";
import type { Deal } from "@/types";

interface ArchiveWonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  onSuccess: () => void;
}

export function ArchiveWonModal({
  open,
  onOpenChange,
  deal,
  onSuccess,
}: ArchiveWonModalProps) {
  const [wonReason, setWonReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirmWon = async () => {
    setSubmitting(true);
    try {
      const supabase = createClient();

      // 1. Dispatch Purchase event to Meta Conversions API
      try {
        const metaRes = await fetch("/api/meta/capi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealId: deal.id,
            eventName: "Purchase",
            value: deal.value || 0,
            currency: deal.currency || "USD",
            contentName: deal.title || "Closed Deal",
            phone: deal.contact?.phone || undefined,
            email: deal.contact?.email || undefined,
            name: deal.contact?.name || undefined,
          }),
        });
        const metaData = await metaRes.json().catch(() => ({}));
        if (metaData?.success) {
          toast.success("🏆 Purchase conversion event sent to Meta Pixel!");
        }
      } catch (metaErr) {
        console.error("Meta CAPI dispatch error:", metaErr);
      }

      // 2. Finalize deal as Won & Archive
      const { error } = await supabase
        .from("deals")
        .update({
          status: "won",
          won_at: new Date().toISOString(),
          won_reason: wonReason.trim() || "Deal finalized and archived to Won Deals",
          updated_at: new Date().toISOString(),
        })
        .eq("id", deal.id);

      if (error) throw error;

      // 3. Record timeline activity
      await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          type: "stage_change",
          title: `🏆 Deal Closed & Archived to Won Deals`,
          description: wonReason.trim() || `Finalized revenue: ${deal.currency || "$"}${Number(deal.value || 0).toLocaleString()}`,
          status: "completed",
        }),
      });

      toast.success("Deal archived to Won Deals successfully!");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to archive deal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Trophy className="size-5 text-emerald-400" />
            Archive Deal to Won Deals
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-300">Finalized Revenue</span>
              <span className="font-mono font-extrabold text-sm text-emerald-400">
                {deal.currency || "$"}{Number(deal.value || 0).toLocaleString()}
              </span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Archiving this deal will finalize it as <strong>Won</strong>, remove it from the Active Pipeline board into your <strong>Won Deals</strong> view, and dispatch the <strong>Purchase</strong> conversion event to Meta Pixel.
            </p>
          </div>

          <div className="flex items-start gap-2 text-muted-foreground text-[11px]">
            <ShieldCheck className="size-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Client: <strong>{deal.contact?.name || "Unnamed Contact"}</strong> ({deal.contact?.phone || "No phone"})
            </span>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Closing Notes / Won Reason (Optional)
            </Label>
            <Textarea
              value={wonReason}
              onChange={(e) => setWonReason(e.target.value)}
              placeholder="e.g. Signed annual contract, verified payment..."
              className="bg-muted text-foreground border-border text-xs resize-none h-18"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="border-border text-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirmWon}
            disabled={submitting}
            className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-md font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                Archiving & Notifying Meta...
              </>
            ) : (
              <>
                <Trophy className="mr-1.5 size-3.5" />
                Confirm & Archive to Won Deals
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
