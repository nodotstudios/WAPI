"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Flame, Globe, ArrowRight } from "lucide-react";
import type { Deal } from "@/types";

interface QualifiedLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  stageName: string;
}

export function QualifiedLeadModal({
  open,
  onOpenChange,
  deal,
  stageName,
}: QualifiedLeadModalProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleSendLeadEvent = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/meta/capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: deal.id,
          eventName: "Lead",
          value: deal.value || 0,
          currency: deal.currency || "USD",
          contentName: deal.title || "Qualified Lead",
          phone: deal.contact?.phone || undefined,
          email: deal.contact?.email || undefined,
          name: deal.contact?.name || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        toast.success("🎯 Qualified Lead conversion event sent to Meta Pixel!");
      } else {
        toast.info("Moved to Qualified stage (Meta CAPI: " + (data?.error || "skipped") + ")");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Failed to send event: " + err.message);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Flame className="size-5 text-purple-400" />
            Mark as Qualified Lead on Meta?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3.5 space-y-1.5">
            <p className="text-foreground font-semibold">
              Deal moved to &quot;{stageName}&quot; stage
            </p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Would you like to dispatch a <strong>&quot;Lead&quot;</strong> conversion event to Meta Pixel for <strong>{deal.contact?.name || deal.title}</strong>?
            </p>
          </div>

          <p className="text-muted-foreground text-[11px]">
            The deal will remain in your active pipeline board in either case.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="border-border text-foreground hover:bg-muted"
          >
            Skip / Keep in Stage
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSendLeadEvent}
            disabled={submitting}
            className="bg-purple-600 text-white hover:bg-purple-700 shadow-md font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                Sending to Meta...
              </>
            ) : (
              <>
                <Globe className="mr-1.5 size-3.5" />
                Yes, Send Qualified Event
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
