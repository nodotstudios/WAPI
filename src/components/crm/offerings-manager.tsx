"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  DollarSign,
  Layers,
  Search,
  Check,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import type { DealOffering } from "@/types";

export function OfferingsManager() {
  const { defaultCurrency } = useAuth();
  const [offerings, setOfferings] = useState<DealOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOffering, setEditingOffering] = useState<DealOffering | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency || "USD");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const loadOfferings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/offerings", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.offerings)) {
        setOfferings(data.offerings);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOfferings();
  }, [loadOfferings]);

  const openCreateModal = () => {
    setEditingOffering(null);
    setTitle("");
    setDescription("");
    setValue("");
    setCurrency(defaultCurrency || "USD");
    setCategory("");
    setModalOpen(true);
  };

  const openEditModal = (offering: DealOffering) => {
    setEditingOffering(offering);
    setTitle(offering.title);
    setDescription(offering.description || "");
    setValue(String(offering.value || 0));
    setCurrency(offering.currency || defaultCurrency || "USD");
    setCategory(offering.category || "");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Please provide an offering title");
      return;
    }
    setSaving(true);
    try {
      if (editingOffering) {
        const res = await fetch(`/api/crm/offerings/${editingOffering.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            value,
            currency,
            category,
          }),
        });
        if (res.ok) {
          toast.success("Offering template updated!");
          setModalOpen(false);
          await loadOfferings();
        } else {
          toast.error("Failed to update offering");
        }
      } else {
        const res = await fetch("/api/crm/offerings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            value,
            currency,
            category,
          }),
        });
        if (res.ok) {
          toast.success("New offering template created!");
          setModalOpen(false);
          await loadOfferings();
        } else {
          toast.error("Failed to create offering");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this offering template?")) return;
    try {
      const res = await fetch(`/api/crm/offerings/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Offering deleted");
        setOfferings((prev) => prev.filter((o) => o.id !== id));
      }
    } catch {
      toast.error("Failed to delete offering");
    }
  };

  const filteredOfferings = offerings.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.title.toLowerCase().includes(q) ||
      (o.description && o.description.toLowerCase().includes(q)) ||
      (o.category && o.category.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Package className="size-5 text-primary" />
            Offerings & Deal Templates
          </h2>
          <p className="text-xs text-muted-foreground">
            Create standard products, service packages, and deal templates for quick 1-click deal creation in chat and CRM.
          </p>
        </div>

        <Button
          size="sm"
          onClick={openCreateModal}
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 h-9"
        >
          <Plus className="size-3.5" />
          Create New Offering
        </Button>
      </div>

      {/* Search & Stats bar */}
      <div className="flex items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search offerings, packages, services..."
            className="h-9 pl-9 text-xs bg-muted border-border"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          <strong>{offerings.length}</strong> predefined offerings
        </div>
      </div>

      {/* Offerings Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : filteredOfferings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-3">
          <Package className="size-10 text-muted-foreground mx-auto" />
          <h3 className="text-sm font-semibold text-foreground">No Offerings Created Yet</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Create standard packages (e.g. &quot;Website Redesign Package - $1,500&quot;, &quot;Monthly SEO Retainer - $500&quot;) so you can generate deals with 1 click in conversations.
          </p>
          <Button
            size="sm"
            onClick={openCreateModal}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5"
          >
            <Plus className="size-3.5" />
            Add First Offering
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOfferings.map((offering) => (
            <div
              key={offering.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-primary/50 transition-all group"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {offering.title}
                    </h4>
                    {offering.category && (
                      <span className="inline-block mt-0.5 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {offering.category}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold text-emerald-400">
                      {offering.currency || "$"}{Number(offering.value || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {offering.description ? (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
                    {offering.description}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No description provided.</p>
                )}
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="size-3 text-amber-400" />
                  Ready to insert into deals
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEditModal(offering)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(offering.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Package className="size-5 text-primary" />
              {editingOffering ? "Edit Offering Template" : "Create Offering Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Offering / Package Title <span className="text-primary">*</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Premium Brand Strategy Package"
                className="bg-muted text-foreground border-border text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Default Value / Price
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 1500.00"
                  className="bg-muted text-foreground border-border text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-border bg-muted px-2 py-2 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="USD">USD ($)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="AED">AED</option>
                  <option value="CAD">CAD</option>
                  <option value="AUD">AUD</option>
                  <option value="SGD">SGD</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Category / Department (Optional)
              </label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Web Design, Consulting, Retainer"
                className="bg-muted text-foreground border-border text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Deal Description & Deliverables
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details of what this package includes, deliverables, timeline..."
                rows={3}
                className="w-full rounded-md border border-border bg-muted p-2 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : "Save Offering"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
