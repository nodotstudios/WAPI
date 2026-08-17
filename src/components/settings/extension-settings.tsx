"use client";

import { useState } from "react";
import { PlugZap, Download, KeyRound, Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function ExtensionSettings() {
  const [generating, setGenerating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateKey = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `WhatsApp Web Extension Key (${new Date().toLocaleDateString()})`,
          scopes: ["contacts:read", "contacts:write", "conversations:read", "messages:send", "messages:read"],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate API Key");
        return;
      }

      setCreatedKey(data.secret || data.key || data.raw_key);
      toast.success("Team Member API Key generated successfully!");
    } catch {
      toast.error("Failed to generate API Key");
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("API Key copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <PlugZap className="size-6 text-primary" />
          WhatsApp Web Chrome Extension Mode
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Chat natively inside official WhatsApp Web (<code className="text-primary font-mono text-xs">web.whatsapp.com</code>) while WAPI injects a live CRM panel on the right side of your screen.
        </p>
      </div>

      {/* Extension Download Card */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
              v1.0.0 Ready
            </span>
            <h3 className="text-base font-semibold text-foreground">WAPI CRM Extension Package</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Includes content script, manifest v3, side-panel UI, and Meta CAPI conversion trigger engine.
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

      {/* Step-by-Step Installation */}
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
            <h4 className="text-xs font-semibold text-foreground">Download & Extract</h4>
            <p className="text-[11px] text-muted-foreground">
              Download <code className="text-primary">extension.zip</code> above and unzip it to a folder on your computer.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 space-y-1">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              2
            </span>
            <h4 className="text-xs font-semibold text-foreground">Load in Chrome</h4>
            <p className="text-[11px] text-muted-foreground">
              Open <code className="text-primary">chrome://extensions</code> in your browser, turn on <strong>Developer mode</strong> (top right), and click <strong>Load unpacked</strong>.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 space-y-1">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              3
            </span>
            <h4 className="text-xs font-semibold text-foreground">Open WhatsApp Web</h4>
            <p className="text-[11px] text-muted-foreground">
              Go to <code className="text-primary">web.whatsapp.com</code>, click ⚙️ in the WAPI side panel, and paste your Team API Key below.
            </p>
          </div>
        </div>
      </div>

      {/* Multi-User Connection API Key Generator */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              Team Member Connection Keys (3–4 Users)
            </h3>
            <p className="text-xs text-muted-foreground">
              Generate API keys for your team members so each user's WhatsApp Web side panel connects to your shared WAPI CRM database.
            </p>
          </div>

          <Button
            size="sm"
            onClick={handleGenerateKey}
            disabled={generating}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {generating ? "Generating..." : "+ Generate Team Key"}
          </Button>
        </div>

        {createdKey && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400">New Extension API Key Created:</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(createdKey)}
                className="h-7 text-xs text-emerald-400 hover:bg-emerald-500/20"
              >
                {copied ? <Check className="size-3.5 mr-1" /> : <Copy className="size-3.5 mr-1" />}
                {copied ? "Copied" : "Copy Secret"}
              </Button>
            </div>
            <Input
              readOnly
              value={createdKey}
              className="bg-background font-mono text-xs text-foreground border-emerald-500/30"
            />
            <p className="text-[11px] text-emerald-300/80">
              Copy this secret key and paste it into the ⚙️ Settings dialog inside your WhatsApp Web extension side panel.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
