"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Zap,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsPanelHead } from "./settings-panel-head";
import { uploadAccountMedia } from "@/lib/storage/upload-media";
import type { QuickReply } from "@/types";

interface DraftState {
  id?: string;
  title: string;
  kind: "text" | "media";
  content_text: string;
  media_url?: string | null;
  media_type?: "image" | "video" | "document" | "audio" | null;
  filename?: string | null;
}

function emptyDraft(): DraftState {
  return {
    title: "",
    kind: "text",
    content_text: "",
    media_url: null,
    media_type: null,
    filename: null,
  };
}

export function QuickRepliesManager() {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quick-replies", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Filter out legacy dummy interactive items
        const list = ((data.quick_replies as QuickReply[]) ?? []).filter(
          (qr) => qr.kind !== "interactive",
        );
        setItems(list);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => setDraft(emptyDraft());
  const openEdit = (qr: QuickReply) =>
    setDraft({
      id: qr.id,
      title: qr.title,
      kind: qr.media_url ? "media" : "text",
      content_text: qr.content_text ?? "",
      media_url: qr.media_url ?? null,
      media_type: qr.media_type ?? null,
      filename: qr.filename ?? null,
    });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !draft) return;

    let mediaType: "image" | "video" | "document" | "audio" = "document";
    if (file.type.startsWith("image/")) mediaType = "image";
    else if (file.type.startsWith("video/")) mediaType = "video";
    else if (file.type.startsWith("audio/")) mediaType = "audio";

    setUploading(true);
    try {
      const result = await uploadAccountMedia("chat-media", file);
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              kind: "media",
              media_url: result.publicUrl,
              media_type: mediaType,
              filename: file.name,
            }
          : null,
      );
      toast.success("File uploaded!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveMedia = () => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            kind: "text",
            media_url: null,
            media_type: null,
            filename: null,
          }
        : null,
    );
  };

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error("Give the quick reply a name or shortcut.");
      return;
    }
    if (!draft.media_url && !draft.content_text.trim()) {
      toast.error("Enter message text or attach a file.");
      return;
    }

    const payload = {
      title: draft.title.trim(),
      kind: draft.media_url ? "media" : "text",
      content_text: draft.content_text.trim() || null,
      media_url: draft.media_url || null,
      media_type: draft.media_type || null,
      filename: draft.filename || null,
      keywords: (draft as any).keywords || null,
    };

    setSaving(true);
    try {
      const res = await fetch(
        draft.id ? `/api/quick-replies/${draft.id}` : "/api/quick-replies",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save the quick reply.");
        return;
      }
      toast.success(draft.id ? "Quick reply updated." : "Quick reply created.");
      setDraft(null);
      await load();
    } catch {
      toast.error("Couldn't save the quick reply.");
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this quick reply?")) return;
      const res = await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Couldn't delete the quick reply.");
        return;
      }
      await load();
    },
    [load],
  );

  return (
    <div>
      <SettingsPanelHead
        title="Quick replies"
        description="Pre-saved text messages and media attachments (photos, PDFs, documents) with captions that agents can send with 1-click in chat."
        action={
          <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-1 h-4 w-4" />
            New quick reply
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No quick replies yet. Create one to quickly reuse canned responses and attachments in the inbox.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((qr) => (
            <li
              key={qr.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-all hover:border-border/80"
            >
              {qr.media_url ? (
                qr.media_type === "image" ? (
                  <div className="size-10 rounded-lg overflow-hidden shrink-0 border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr.media_url} alt={qr.title} className="size-full object-cover" />
                  </div>
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <FileText className="size-5" />
                  </div>
                )
              ) : (
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                  <MessageSquare className="size-5" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{qr.title}</p>
                  {qr.media_url && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      <Paperclip className="size-2.5" />
                      {qr.filename || "Attachment"}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground mt-0.5">
                  {qr.content_text || (qr.media_url ? "Attachment only" : "")}
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(qr)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(qr.id)}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit quick reply" : "New quick reply"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Shortcut / Title
                </label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. /pricing, /brochure, or Bank Account"
                  className="bg-muted text-foreground border-border"
                />
              </div>

              {/* Media Attachment Section */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Attachment (Optional image, PDF, or document)
                </label>
                {draft.media_url ? (
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-muted/40">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {draft.media_type === "image" ? (
                        <div className="size-12 rounded-lg overflow-hidden shrink-0 border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={draft.media_url} alt="preview" className="size-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                          <FileText className="size-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {draft.filename || "Attached file"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Ready to send</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveMedia}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2"
                    >
                      <X className="size-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full justify-center border-dashed border-border py-4 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-2" />
                          Uploading attachment...
                        </>
                      ) : (
                        <>
                          <Paperclip className="size-4 mr-2" />
                          Attach Image or PDF / Document
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {draft.media_url ? "Caption / Accompanying Text" : "Message Text"}
                </label>
                <Textarea
                  value={draft.content_text || ""}
                  onChange={(e) => setDraft({ ...draft, content_text: e.target.value })}
                  placeholder={
                    draft.media_url
                      ? "Add a caption or description for this attachment..."
                      : "Type the message snippet to automatically insert..."
                  }
                  className="min-h-28 bg-muted text-foreground border-border text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>Trigger Keywords (Smart Auto-Suggestions)</span>
                  <span className="text-[10px] text-primary">Comma separated</span>
                </label>
                <Input
                  value={
                    Array.isArray((draft as any).keywords)
                      ? (draft as any).keywords.join(", ")
                      : (draft as any).keywords || ""
                  }
                  onChange={(e) => setDraft({ ...draft, keywords: e.target.value } as any)}
                  placeholder="e.g. process, pricing, demo, steps"
                  className="bg-muted text-foreground border-border text-xs rounded-xl h-10"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  When a customer mentions any of these words in chat, a quick reply recommendation pill will appear above the composer.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving || uploading}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving || uploading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save Quick Reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
