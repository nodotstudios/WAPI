"use client";

import { useState, useEffect } from "react";
import {
  PlugZap,
  Download,
  ShieldCheck,
  UsersRound,
  Circle,
  LogIn,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface TeamMember {
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;
  last_seen_at?: string;
}

export function ExtensionSettings() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const loadMembers = async () => {
    try {
      const res = await fetch("/api/account/members", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.members)) {
          setMembers(data.members);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const isMemberOnline = (lastSeen?: string) => {
    if (!lastSeen) return false;
    const diff = (Date.now() - new Date(lastSeen).getTime()) / 1000 / 60;
    return diff < 10; // Online if active in last 10 minutes
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <PlugZap className="size-6 text-primary" />
          WhatsApp Web Chrome Extension Mode
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your CRM directly inside official WhatsApp Web (
          <code className="text-primary font-mono text-xs">web.whatsapp.com</code>
          ). Team members simply log in with their WAPI email & password.
        </p>
      </div>

      {/* Extension Download Card */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
              v1.0.0 Ready
            </span>
            <h3 className="text-base font-semibold text-foreground">
              WAPI CRM Extension Package
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Includes direct Email & Password login, live WhatsApp contact sync, pipeline stage management, and Meta CAPI conversion tracking.
          </p>
        </div>

        <a
          href="/extension.zip"
          download="wapi-extension.zip"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
        >
          <Download className="size-4" />
          Download Extension ZIP
        </a>
      </div>

      {/* Quick 3-Step Setup Guide */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-400" />
          Quick 3-Step Setup Guide
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 space-y-1">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              1
            </span>
            <h4 className="text-xs font-semibold text-foreground">
              Download & Extract
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Download <code className="text-primary">extension.zip</code> above and unzip it to a folder on your computer.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 space-y-1">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              2
            </span>
            <h4 className="text-xs font-semibold text-foreground">
              Load in Chrome
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Open <code className="text-primary">chrome://extensions</code> in your browser, turn on <strong>Developer mode</strong> (top right), and click <strong>Load unpacked</strong>.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 space-y-1">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              3
            </span>
            <h4 className="text-xs font-semibold text-foreground">
              Sign In on WhatsApp Web
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Go to <code className="text-primary">web.whatsapp.com</code> and simply enter your WAPI email and password into the side panel!
            </p>
          </div>
        </div>
      </div>

      {/* Team Member Status Roster */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <UsersRound className="size-4 text-primary" />
              Team Members & Live Presence
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Each team member logs into the WhatsApp Web extension using their existing WAPI credentials.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {members.map((m) => {
            const online = isMemberOnline(m.last_seen_at);
            return (
              <div
                key={m.user_id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs uppercase text-primary border border-border">
                    {(m.full_name || m.email || "U").charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {m.full_name || "Team Member"}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {m.role}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.email}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      online
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-muted text-muted-foreground border border-border/60"
                    }`}
                  >
                    <Circle
                      className={`size-2 ${
                        online
                          ? "fill-emerald-400 text-emerald-400 animate-pulse"
                          : "fill-muted-foreground text-muted-foreground"
                      }`}
                    />
                    {online ? "Online on WhatsApp Web" : "Offline"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
