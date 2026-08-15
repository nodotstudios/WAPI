"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Zap, Paperclip, FileText } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { QuickReply } from "@/types";

interface QuickReplyPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (qr: QuickReply) => void;
}

/**
 * Lists the account's saved quick replies for instant insertion into the composer.
 */
export function QuickReplyPicker({
  open,
  onOpenChange,
  onPick,
}: QuickReplyPickerProps) {
  const t = useTranslations("Inbox.composer");
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/quick-replies", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          const list = ((data.quick_replies as QuickReply[]) ?? []).filter(
            (qr) => qr.kind !== "interactive",
          );
          setItems(list);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Zap className="size-4 text-primary" />
            {t("quickReplies")}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pt-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("quickRepliesEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((qr) => (
                <li key={qr.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(qr);
                      onOpenChange(false);
                    }}
                    className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/50 hover:bg-muted"
                  >
                    {qr.media_url ? (
                      qr.media_type === "image" ? (
                        <div className="size-9 rounded-lg overflow-hidden shrink-0 border border-border bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qr.media_url} alt={qr.title} className="size-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                          <FileText className="size-4" />
                        </div>
                      )
                    ) : (
                      <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                        <MessageSquare className="size-4" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {qr.title}
                        </span>
                        {qr.media_url && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground flex items-center gap-0.5">
                            <Paperclip className="size-2.5" />
                            {qr.filename || "File"}
                          </span>
                        )}
                      </div>
                      <span className="block line-clamp-2 text-xs text-muted-foreground mt-0.5">
                        {qr.content_text || (qr.media_url ? "Attachment only" : "")}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
