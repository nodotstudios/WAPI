"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SettingsPanelHead } from "./settings-panel-head";

export function DataRetentionSettings() {
  const [retentionDays, setRetentionDays] = useState<number>(0);
  const [totalMessages, setTotalMessages] = useState<number>(0);
  const [storageFormatted, setStorageFormatted] = useState<string>("0 KB");
  const [storageMb, setStorageMb] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/retention", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRetentionDays(data.retention_days ?? 0);
        setTotalMessages(data.total_messages ?? 0);
        setStorageFormatted(data.storage_formatted ?? "0 KB");
        setStorageMb(data.storage_mb ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSave = async (triggerPurge = false) => {
    if (triggerPurge) setPurging(true);
    else setSaving(true);

    try {
      const res = await fetch("/api/account/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retention_days: retentionDays,
          trigger_purge_now: triggerPurge,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to update retention policy");
        return;
      }

      if (triggerPurge) {
        toast.success(`Purge completed! Deleted ${data.purged_count || 0} expired messages from Supabase.`);
      } else {
        toast.success("Data retention policy updated successfully!");
      }

      await loadData();
    } catch {
      toast.error("An error occurred while updating settings");
    } finally {
      setSaving(false);
      setPurging(false);
    }
  };

  const freeTierLimitMb = 500;
  const pctUsed = Math.min(100, Math.max(0.1, (storageMb / freeTierLimitMb) * 100));

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Data Retention & Auto-Purge"
        description="Configure automatic cleanup of old chat messages to keep your Supabase database fast and free."
        action={
          <Button
            onClick={() => handleSave(false)}
            disabled={saving || loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save Policy
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Storage Usage Overview Card */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Database className="size-4 text-primary" />
                  Account Messages
                </span>
                <span className="font-semibold text-foreground">{totalMessages.toLocaleString()} records</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {totalMessages.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">stored in CRM</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="size-4 text-emerald-400" />
                  Storage Footprint
                </span>
                <span className="font-semibold text-emerald-400">{storageFormatted} / {freeTierLimitMb} MB</span>
              </div>
              <div className="space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.max(2, pctUsed)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{pctUsed.toFixed(2)}% of 500MB Free Tier</span>
                  <span>{(freeTierLimitMb - storageMb).toFixed(1)} MB available</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Retention Policy Card */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Clock className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Chat Message Retention Window
                </h3>
                <p className="text-xs text-muted-foreground">
                  Choose how long customer chat history should be kept in the CRM before older messages are automatically purged.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Auto-Purge Chat Older Than:
                </label>
                <select
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(parseInt(e.target.value, 10))}
                  className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                >
                  <option value={0}>Keep Forever (No Auto-Purge)</option>
                  <option value={30}>30 Days (Recommended for optimal storage)</option>
                  <option value={60}>60 Days</option>
                  <option value={90}>90 Days</option>
                </select>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-4">
                <ShieldCheck className="size-8 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-foreground">Zero-Risk Data Purge</div>
                  <div className="text-[11px] text-muted-foreground">
                    Only old chat bubbles are purged. Contacts & sales logs stay permanently.
                  </div>
                </div>
              </div>
            </div>

            {/* Storage Protection Notice */}
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">
              <ShieldCheck className="size-5 shrink-0 text-emerald-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-emerald-400">
                  Your Leads & Revenue Data are 100% Protected:
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Auto-purging <strong>only</strong> deletes older message bubbles and media attachments from your database. Your <strong>Contacts</strong>, <strong>Phone Numbers</strong>, <strong>Deals</strong>, <strong>Notes</strong>, and <strong>Facebook Ad Conversion logs</strong> are permanently saved in the CRM and will never be deleted.
                </p>
              </div>
            </div>

            {/* Manual Purge Action */}
            {retentionDays > 0 && (
              <div className="border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    Manual Storage Cleanup
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Immediately purge all chat messages older than {retentionDays} days from Supabase.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave(true)}
                  disabled={purging || saving}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  {purging ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                      Purging Expired Data...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-1.5 size-4" />
                      Purge Data Now ({retentionDays}d)
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
