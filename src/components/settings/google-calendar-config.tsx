"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, CheckCircle2, XCircle, Video, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SettingsPanelHead } from "./settings-panel-head";

export function GoogleCalendarConfig() {
  const [status, setStatus] = useState<{ connected: boolean; email?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/google/status", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/integrations/google/auth");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Failed to initiate Google OAuth. Please configure GOOGLE_CLIENT_ID in environment.");
      }
    } catch {
      toast.error("Failed to connect Google Calendar");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/google/status", { method: "DELETE" });
      if (res.ok) {
        toast.success("Google Calendar disconnected");
        await loadStatus();
      }
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Google Calendar & Google Meet"
        description="Connect your Google Workspace or Gmail account to sync CRM meetings, schedule video calls, and generate Google Meet links automatically."
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
                <Calendar className="size-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Google Calendar Account
                </h3>
                <p className="text-xs text-muted-foreground">
                  {status?.connected
                    ? `Connected as ${status.email || "Google Account"}`
                    : "No Google account currently linked."}
                </p>
              </div>
            </div>

            <div>
              {status?.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect Google Account"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={connecting}
                  className="bg-blue-600 text-white hover:bg-blue-700 text-xs gap-1.5"
                >
                  {connecting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Calendar className="size-3.5" />
                  )}
                  Connect Google Calendar
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t border-border">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Video className="size-4 text-blue-400" />
                1-Click Google Meet
              </div>
              <p className="text-[11px] text-muted-foreground">
                Automatically generate instant video links when scheduling CRM meetings.
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Calendar className="size-4 text-emerald-400" />
                2-Way Calendar Sync
              </div>
              <p className="text-[11px] text-muted-foreground">
                Meetings and calls scheduled in CRM appear instantly in your Google Calendar.
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CheckCircle2 className="size-4 text-primary" />
                Attendee Invitations
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sends calendar invitations directly to your client&apos;s email address.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
