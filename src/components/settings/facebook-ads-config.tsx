"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  DollarSign,
  Eye,
  EyeOff,
  Flame,
  Globe,
  HelpCircle,
  KeyRound,
  Layers,
  Loader2,
  Play,
  Save,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SettingsPanelHead } from "./settings-panel-head";
import type { FacebookAdsConfig, FacebookConversionEvent } from "@/types";

export function FacebookAdsConfig() {
  const [config, setConfig] = useState<FacebookAdsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Form State
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [autoSendOnDealWon, setAutoSendOnDealWon] = useState(true);

  // Event Logs
  const [events, setEvents] = useState<FacebookConversionEvent[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/meta/config", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.config) {
        setConfig(data.config);
        setPixelId(data.config.pixel_id || "");
        setAccessToken(data.config.access_token || "");
        setTestEventCode(data.config.test_event_code || "");
        setCurrency(data.config.currency || "USD");
        setAutoSendOnDealWon(data.config.auto_send_on_deal_won ?? true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/meta/capi?limit=15", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadLogs();
  }, [loadConfig, loadLogs]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/meta/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pixel_id: pixelId,
          access_token: accessToken,
          test_event_code: testEventCode,
          currency,
          auto_send_on_deal_won: autoSendOnDealWon,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save Facebook Ads settings");
        return;
      }

      toast.success("Facebook Ads & CAPI configuration saved!");
      await loadConfig();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTestEvent = async () => {
    if (!pixelId.trim() || !accessToken.trim()) {
      toast.error("Please enter and save your Pixel ID and Access Token first.");
      return;
    }

    setTesting(true);
    try {
      const res = await fetch("/api/meta/capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: "Purchase",
          value: 100.0,
          currency,
          content_name: "Test Conversion Event",
          phone: "15551234567",
          test_event_code_override: testEventCode || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`Meta CAPI Test Error: ${data.error || "Failed to send test event"}`);
        return;
      }

      toast.success("Test event successfully received by Meta Conversions API!");
      await loadLogs();
    } catch {
      toast.error("Test event request failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Facebook Pixel"
        description="Push server-side conversion events (Sales, Leads, ROAS) directly to Meta Ads Manager so Facebook's algorithm optimizes for high-paying buyers."
        action={
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save Configuration
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Main Credentials Card */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                <Globe className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Meta Pixel / Dataset Credentials
                </h3>
                <p className="text-xs text-muted-foreground">
                  Find these in your Meta Events Manager under Settings → Conversions API.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Meta Dataset / Pixel ID
                </label>
                <Input
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                  placeholder="e.g. 1234567890123456"
                  className="bg-muted text-foreground border-border"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Default Conversion Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                >
                  <option value="USD">USD — US Dollar ($)</option>
                  <option value="INR">INR — Indian Rupee (₹)</option>
                  <option value="EUR">EUR — Euro (€)</option>
                  <option value="GBP">GBP — British Pound (£)</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="CAD">CAD — Canadian Dollar</option>
                  <option value="AUD">AUD — Australian Dollar</option>
                  <option value="SGD">SGD — Singapore Dollar</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Conversions API Access Token</span>
                <span className="text-[11px] text-muted-foreground/80">
                  Generate in Events Manager → Set up Direct Integration
                </span>
              </label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAG..."
                  className="bg-muted text-foreground border-border pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 pt-1">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Test Event Code (Optional)
                </label>
                <Input
                  value={testEventCode}
                  onChange={(e) => setTestEventCode(e.target.value)}
                  placeholder="e.g. TEST12345 (from Test Events tab)"
                  className="bg-muted text-foreground border-border"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Paste the code from Meta Events Manager &quot;Test Events&quot; tab to verify events in real time.
                </p>
              </div>

              <div className="flex flex-col justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestEvent}
                  disabled={testing}
                  className="h-10 border-border text-foreground hover:bg-muted"
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin text-primary" />
                      Sending to Meta...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 size-4 text-emerald-400" />
                      Send Test Event to Meta
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Automation & Pipeline Rules */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <DollarSign className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Automatic Deal &quot;Won&quot; Purchase Trigger
                </h3>
                <p className="text-xs text-muted-foreground">
                  Automatically send a Meta CAPI <strong>Purchase</strong> event with the deal amount whenever a deal is moved to a &quot;Won&quot; stage in CRM Pipelines.
                </p>
              </div>
              <Switch
                checked={autoSendOnDealWon}
                onCheckedChange={setAutoSendOnDealWon}
              />
            </div>
          </div>

          {/* Realtime Event Logs Table */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Recent Conversion Event Dispatches
                </h3>
                <p className="text-xs text-muted-foreground">
                  Audit logs of events pushed to Meta Graph API.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadLogs}
                disabled={loadingLogs}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                {loadingLogs ? <Loader2 className="size-3.5 animate-spin" /> : "Refresh Logs"}
              </Button>
            </div>

            {events.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                No conversion events recorded yet. Send a test event above or close a deal in Pipelines.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-2 font-medium">Event</th>
                      <th className="pb-2 font-medium">Value</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Meta Trace ID</th>
                      <th className="pb-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 text-foreground">
                    {events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-muted/30">
                        <td className="py-2.5 font-semibold text-primary">{ev.event_name}</td>
                        <td className="py-2.5">
                          {ev.value ? `${ev.currency || "USD"} ${ev.value.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2.5">
                          {ev.status === "sent" ? (
                            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                              Delivered
                            </span>
                          ) : ev.status === "test_sent" ? (
                            <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                              Test Event
                            </span>
                          ) : (
                            <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 font-mono text-[10px] text-muted-foreground">
                          {ev.meta_event_id || "—"}
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {new Date(ev.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
