"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles, Pencil } from "lucide-react";
import type { Deal, PipelineStage } from "@/types";

interface EditDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  stages: PipelineStage[];
  onSaved: () => void;
}

export function EditDealModal({
  open,
  onOpenChange,
  deal,
  stages,
  onSaved,
}: EditDealModalProps) {
  const [title, setTitle] = useState(deal.title || "");
  const [value, setValue] = useState(String(deal.value ?? 0));
  const [currency, setCurrency] = useState(deal.currency || "USD");
  const [stageId, setStageId] = useState(deal.stage_id || "");
  const [expectedCloseDate, setExpectedCloseDate] = useState(deal.expected_close_date || "");
  const [offerings, setOfferings] = useState<any[]>([]);
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync state when deal changes or modal opens
  useEffect(() => {
    if (deal) {
      setTitle(deal.title || "");
      setValue(String(deal.value ?? 0));
      setCurrency(deal.currency || "USD");
      setStageId(deal.stage_id || "");
      setExpectedCloseDate(deal.expected_close_date || "");
      setSelectedOfferingId("");
    }
  }, [deal, open]);

  // Load predefined offerings
  useEffect(() => {
    async function loadOfferings() {
      try {
        const res = await fetch("/api/crm/offerings", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.offerings)) {
          setOfferings(data.offerings);
        }
      } catch (err) {
        console.error("Failed to load offerings:", err);
      }
    }
    if (open) {
      void loadOfferings();
    }
  }, [open]);

  // Handle template selection
  const handleTemplateChange = (offeringId: string) => {
    setSelectedOfferingId(offeringId);
    if (!offeringId) return;
    const match = offerings.find((o) => o.id === offeringId);
    if (match) {
      setTitle(match.title || "");
      setValue(String(match.value ?? 0));
      if (match.currency) setCurrency(match.currency);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please provide an offer title");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const numValue = parseFloat(value) || 0;

      const { error } = await supabase
        .from("deals")
        .update({
          title: title.trim(),
          value: numValue,
          currency: currency || "USD",
          stage_id: stageId || deal.stage_id,
          expected_close_date: expectedCloseDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deal.id);

      if (error) throw error;

      toast.success("Offer details updated successfully!");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to update offer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-card border-border">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Pencil className="size-4 text-primary" />
              Edit Offer / Deal Details
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 text-xs">
            {/* Predefined Offering Template Picker */}
            {offerings.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  Apply Predefined Offering Template (Optional)
                </Label>
                <select
                  value={selectedOfferingId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="">-- Keep Current / Custom --</option>
                  {offerings.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} ({o.currency || "$"}{Number(o.value || 0).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Title */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Offer / Deal Title
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Website Redesign Retainer"
                className="bg-muted text-foreground border-border text-xs"
                required
              />
            </div>

            {/* Value & Currency */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Offer Value
                </Label>
                <Input
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0.00"
                  className="bg-muted text-foreground border-border text-xs font-mono"
                  required
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Currency
                </Label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary font-mono"
                >
                  <option value="USD">USD ($)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="AED">AED (د.إ)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                  <option value="SGD">SGD ($)</option>
                </select>
              </div>
            </div>

            {/* Pipeline Stage */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Pipeline Stage
              </Label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
              >
                {stages.map((stg) => (
                  <option key={stg.id} value={stg.id}>
                    {stg.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Expected Close Date */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Expected Close Date (Optional)
              </Label>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="bg-muted text-foreground border-border text-xs"
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
              type="submit"
              size="sm"
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
