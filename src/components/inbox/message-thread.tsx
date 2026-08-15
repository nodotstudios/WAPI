"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePresence } from "@/hooks/use-presence";
import { PresenceDot } from "@/components/presence/presence-dot";
import { presenceLabel } from "@/lib/presence";
import { cn } from "@/lib/utils";
import type {
  Conversation,
  Message,
  MessageReaction,
  Contact,
  ConversationStatus,
  MessageTemplate,
  Profile,
  InteractiveMessagePayload,
} from "@/types";
import {
  MessageSquare,
  ChevronDown,
  UserPlus,
  Check,
  Clock,
  ArrowLeft,
  RefreshCw,
  PanelRightOpen,
  PanelRightClose,
  Phone,
  Video,
  DollarSign,
  Globe,
  Loader2,
  Trash2,
  Plus,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { format, isToday, isYesterday, differenceInHours } from "date-fns";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { MessageActions } from "./message-actions";
import { MediaLightbox } from "./media-lightbox";
import { collectMediaGallery } from "@/lib/media/gallery";
import {
  MessageComposer,
  CHAT_MEDIA_BUCKET,
  type SendMediaPayload,
} from "./message-composer";
import { deleteAccountMedia } from "@/lib/storage/upload-media";
import { TemplatePicker } from "./template-picker";
import { AiThreadBanner } from "./ai-thread-banner";
import { buildReplyPreview } from "./reply-quote";
import { renderTemplateBody } from "@/lib/whatsapp/template-body";
import { toast } from "sonner";

interface ReplyDraft {
  id: string;
  authorLabel: string;
  preview: string;
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  onAssignChange: (
    conversationId: string,
    assignedAgentId: string | null,
  ) => void;
  /**
   * On mobile, the thread is shown full-screen with the conversation list
   * hidden. This callback lets the page deselect the active conversation
   * and reveal the list again. Rendered as a back-arrow in the header on
   * mobile only.
   */
  onBack?: () => void;
  /**
   * Increment to force the messages + reactions fetch effects to refire.
   * Parent bumps this on realtime reconnect / tab visibility → visible
   * so the open thread catches up on any events sent while the WS was
   * disconnected or the tab was throttled. Optional so existing callers
   * keep working.
   */
  resyncToken?: number;
  /**
   * Fired by the manual-refresh button in the thread header. The parent
   * typically bumps the same `resyncToken` it controls — this gives the
   * user a way to force a refetch when they suspect realtime missed an
   * event (or they're impatient). Optional so existing callers keep
   * working; the button is only rendered when this is provided.
   */
  onRefresh?: () => void;
  /**
   * Desktop-only contact-panel toggle. The page owns the open/closed
   * state (it's the one that renders the sidebar), so the thread just
   * reflects it and asks the page to flip it. Both optional so existing
   * callers keep working; the toggle button only renders when
   * `onToggleContactPanel` is wired up.
   */
  contactPanelOpen?: boolean;
  onToggleContactPanel?: () => void;
}

function formatDateSeparator(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const date = new Date(dateStr);
  if (isToday(date)) return t("today");
  if (isYesterday(date)) return t("yesterday");
  return format(date, "MMMM d, yyyy");
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const day = format(new Date(msg.created_at), "yyyy-MM-dd");
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

const STATUS_OPTIONS: { label: string; value: ConversationStatus; color: string }[] = [
  { label: "Open", value: "open", color: "text-primary" },
  { label: "Pending", value: "pending", color: "text-amber-400" },
  { label: "Closed", value: "closed", color: "text-muted-foreground" },
];

/**
 * WhatsApp-style doodle background applied to the chat area (both the
 * active thread and the empty state). The SVG tile lives at
 * `/public/inbox-doodle.svg`; the slate-950 colour sits underneath so
 * the doodles read as a subtle pattern rather than a stark grid.
 *
 * Defined once at module scope so the two render paths can't drift —
 * if we ever switch the asset, both spots update together.
 */
const DOODLE_BG_CLASSES =
  "bg-background bg-[url('/inbox-doodle.svg')] bg-repeat";

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onAssignChange,
  onBack,
  resyncToken = 0,
  onRefresh,
  contactPanelOpen,
  onToggleContactPanel,
}: MessageThreadProps) {
  const t = useTranslations("Inbox.messageThread");
  const tTimer = useTranslations("Inbox.sessionTimer");
  const tQuote = useTranslations("Inbox.replyQuote");

  const { user, accountId, defaultCurrency } = useAuth();
  const { getPresence, getRow, now } = usePresence();
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  // Purely visual spin state for the manual-refresh button. The actual
  // refetch is fire-and-forget through `onRefresh` (which bumps the
  // parent's resyncToken); the 700ms spin is just feedback so the click
  // doesn't feel like a no-op. Cleared via the timer ref on unmount.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  const handleRefreshClick = useCallback(() => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    onRefresh();
    refreshTimerRef.current = setTimeout(() => {
      setIsRefreshing(false);
      refreshTimerRef.current = null;
    }, 700);
  }, [isRefreshing, onRefresh]);
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);

  // ==========================================
  // CRM Deals & Meta Conversion Synchronizer
  // ==========================================
  const [createDealModalOpen, setCreateDealModalOpen] = useState(false);
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [newDealTitle, setNewDealTitle] = useState("");
  const [newDealValue, setNewDealValue] = useState("");
  const [newDealCurrency, setNewDealCurrency] = useState(defaultCurrency || "USD");
  const [newDealDescription, setNewDealDescription] = useState("");
  const [offerings, setOfferings] = useState<any[]>([]);

  const [contactDeals, setContactDeals] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [loadingDeals, setLoadingDeals] = useState(false);

  const [isQrMode, setIsQrMode] = useState(false);
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [conversionAmount, setConversionAmount] = useState("");
  const [conversionEvent, setConversionEvent] = useState<"Purchase" | "Lead">("Purchase");
  const [conversionCurrency, setConversionCurrency] = useState(defaultCurrency || "USD");
  const [loggingConversion, setLoggingConversion] = useState(false);

  const contactDisplayName = conversation?.contact?.name || conversation?.contact?.phone || "Contact";

  const loadContactDealsAndStages = useCallback(async () => {
    if (!conversation?.contact?.id) return;
    setLoadingDeals(true);
    try {
      const supabase = createClient();
      const [dealsRes, pipelinesRes, offeringsRes] = await Promise.all([
        supabase
          .from("deals")
          .select("id, title, value, currency, stage_id, status, created_at, stage:pipeline_stages(id, name, color, position)")
          .eq("contact_id", conversation.contact.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("pipelines")
          .select("id, name, stages:pipeline_stages(id, name, color, position)")
          .order("created_at", { ascending: true }),
        supabase
          .from("deal_offerings")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
      ]);

      if (dealsRes.data) {
        setContactDeals(dealsRes.data);
        if (dealsRes.data.length > 0) {
          setSelectedDealId(dealsRes.data[0].id);
          if (dealsRes.data[0].value) {
            setConversionAmount(String(dealsRes.data[0].value));
          }
          if (dealsRes.data[0].currency) {
            setConversionCurrency(dealsRes.data[0].currency);
          }
        }
      }
      if (pipelinesRes.data) {
        setPipelines(pipelinesRes.data);
      }
      if (offeringsRes.data) {
        setOfferings(offeringsRes.data);
      }
    } finally {
      setLoadingDeals(false);
    }
  }, [conversation?.contact?.id, conversionAmount]);

  useEffect(() => {
    if (conversionModalOpen || createDealModalOpen) {
      void loadContactDealsAndStages();
    }
  }, [conversionModalOpen, createDealModalOpen, loadContactDealsAndStages]);

  const handleCreateDeal = async () => {
    if (!conversation?.contact?.id || !user?.id) return;
    const title = newDealTitle.trim() || `Deal with ${contactDisplayName}`;
    setCreatingDeal(true);
    try {
      const supabase = createClient();
      let targetPipeline = pipelines[0];
      if (!targetPipeline) {
        const { data } = await supabase
          .from("pipelines")
          .select("id, name, stages:pipeline_stages(id, name, color, position)")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        targetPipeline = data;
      }

      if (!targetPipeline || !targetPipeline.stages || targetPipeline.stages.length === 0) {
        toast.error("No pipeline stages found in CRM. Please set up a pipeline in Pipelines page.");
        return;
      }

      const sortedStages = [...targetPipeline.stages].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
      const firstStage = sortedStages[0];

      const val = parseFloat(newDealValue) || 0;
      const { data: newDeal, error } = await supabase
        .from("deals")
        .insert({
          user_id: user.id,
          account_id: accountId || undefined,
          contact_id: conversation.contact.id,
          conversation_id: conversation.id,
          pipeline_id: targetPipeline.id,
          stage_id: firstStage.id,
          title,
          description: newDealDescription.trim() || null,
          value: val,
          currency: newDealCurrency || defaultCurrency,
          status: "open",
        })
        .select("id, title, value, currency, stage_id, status, created_at, stage:pipeline_stages(id, name, color, position)")
        .single();

      if (error || !newDeal) {
        toast.error("Failed to create deal: " + (error?.message || ""));
        return;
      }

      toast.success(`🎉 Deal created and placed in "${firstStage.name}" stage on CRM Pipeline!`);
      setCreateDealModalOpen(false);
      setNewDealTitle("");
      setNewDealValue("");
      await loadContactDealsAndStages();
      setSelectedDealId(newDeal.id);
      if (val > 0) setConversionAmount(String(val));
    } catch (err: any) {
      toast.error("Error creating deal: " + (err?.message || ""));
    } finally {
      setCreatingDeal(false);
    }
  };

  const handleLogConversion = async () => {
    if (!conversation?.contact?.id) return;

    // Check if active deal exists
    const activeDeal = contactDeals.find((d) => d.id === selectedDealId) || contactDeals[0];
    if (!activeDeal) {
      toast.error("Please create a deal first before qualifying or logging a sale.");
      return;
    }

    const num = parseFloat(conversionAmount);
    if (conversionEvent === "Purchase" && (isNaN(num) || num <= 0)) {
      toast.error("Please enter a valid sale amount.");
      return;
    }

    setLoggingConversion(true);
    try {
      const supabase = createClient();
      const defaultPipeline = pipelines[0];
      const sortedStages = defaultPipeline?.stages
        ? [...defaultPipeline.stages].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        : [];

      let targetStageName = "";

      if (conversionEvent === "Lead") {
        // Find Qualification stage (matching /qualif|contact|in progress/i or 2nd stage)
        const qualStage =
          sortedStages.find((s: any) => /qualif|contact|in progress/i.test(s.name)) ||
          (sortedStages.length > 1 ? sortedStages[1] : sortedStages[0]);

        if (qualStage) {
          targetStageName = qualStage.name;
          await supabase
            .from("deals")
            .update({
              stage_id: qualStage.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", activeDeal.id);
        }
      } else if (conversionEvent === "Purchase") {
        // Find Won stage (matching /won|closed won|converted/i or last stage)
        const wonStage =
          sortedStages.find((s: any) => /won|closed won|converted/i.test(s.name)) ||
          sortedStages[sortedStages.length - 1];

        if (wonStage) {
          targetStageName = wonStage.name;
          await supabase
            .from("deals")
            .update({
              stage_id: wonStage.id,
              status: "won",
              value: num,
              currency: conversionCurrency,
              updated_at: new Date().toISOString(),
            })
            .eq("id", activeDeal.id);
        }
      }

      // Push event to Meta CAPI
      const res = await fetch("/api/meta/capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: conversation.contact.id,
          deal_id: activeDeal.id,
          event_name: conversionEvent,
          value: num || undefined,
          currency: conversionCurrency,
          content_name: activeDeal.title || `Sale from Chat (${contactDisplayName})`,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`Meta CAPI Error: ${data.error || "Failed to push conversion"}`);
        return;
      }

      if (conversionEvent === "Purchase") {
        toast.success(
          `💰 Sale logged! Deal marked as WON (${targetStageName}) and pushed ${conversionCurrency} ${num.toFixed(2)} to Facebook Pixel!`
        );
      } else {
        toast.success(`🎯 Lead qualified! Deal moved to "${targetStageName}" in CRM Pipeline and pushed to Meta Ads.`);
      }

      setConversionModalOpen(false);
      await loadContactDealsAndStages();
    } catch {
      toast.error("Failed to process conversion");
    } finally {
      setLoggingConversion(false);
    }
  };

  // Which attachment the media viewer is showing. Lives here rather than in
  // the bubble so the viewer can page through every image/video in the
  // thread (issue #373). Paired with the conversation it belongs to and read
  // back through that check below, so switching threads closes the viewer
  // without an effect racing the messages refetch.
  const [openMedia, setOpenMedia] = useState<{
    conversationId: string;
    messageId: string;
  } | null>(null);

  // Profiles are bounded by RLS to rows the current user is allowed to
  // see — today that's just the current user, but the dropdown keeps the
  // shape ready for shared-team workspaces without a refactor.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .order("full_name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to fetch profiles:", error);
          return;
        }
        setProfiles((data as Profile[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [clearChatModalOpen, setClearChatModalOpen] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);

  const handleClearChatFromCrm = async () => {
    if (!conversation?.id) return;
    setClearingChat(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/purge-messages`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to clear chat history");
        return;
      }
      toast.success("Chat history cleared from CRM. Contacts and sales logs are preserved.");
      setClearChatModalOpen(false);
      if (onRefresh) onRefresh();
    } catch {
      toast.error("Failed to clear chat history");
    } finally {
      setClearingChat(false);
    }
  };

  useEffect(() => {
    async function checkMode() {
      try {
        const supabase = createClient();
        const { data } = await supabase.from('whatsapp_config').select('connection_mode').maybeSingle();
        if (data?.connection_mode === 'qr_gateway') {
          setIsQrMode(true);
        }
      } catch (err) {
        console.error('Failed to check qr mode:', err);
      }
    }
    checkMode();
  }, []);

  // 24-hour session timer
  const sessionInfo = useMemo(() => {
    if (!messages.length) return { expired: false, remaining: "" };

    // Find last customer message
    const lastCustomerMsg = [...messages]
      .reverse()
      .find((m) => m.sender_type === "customer");

    if (!lastCustomerMsg) return { expired: true, remaining: "No customer messages" };

    if (isQrMode) {
      return { expired: false, remaining: "Unlimited (QR Mode)" };
    }

    const hoursSince = differenceInHours(new Date(), new Date(lastCustomerMsg.created_at));
    const expired = hoursSince >= 24;

    if (expired) {
      return { expired: true, remaining: tTimer("expired") };
    }

    const hoursLeft = 24 - hoursSince;
    const remaining =
      hoursLeft >= 1
        ? tTimer("xhRemaining", { hours: Math.floor(hoursLeft) })
        : tTimer("xmRemaining", { minutes: Math.floor(hoursLeft * 60) });

    return { expired, remaining };
  }, [messages, isQrMode, tTimer]);

  // Store latest callback in a ref so fetchMessages doesn't need to
  // depend on `onMessagesLoaded` — otherwise parent re-renders cause
  // fetchMessages to change → useEffect re-fires → refetch → realtime
  // UPDATE on conversations.unread_count → parent re-renders → LOOP.
  // The ref is written inside an effect so the mutation doesn't happen
  // during render (React 19 refs rule); consumers only read `.current`
  // inside the async fetch completion, which runs after the render.
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  });

  const conversationId = conversation?.id;
  const hasUnread = (conversation?.unread_count ?? 0) > 0;

  const mediaMessageId =
    openMedia && openMedia.conversationId === conversationId
      ? openMedia.messageId
      : null;
  const handleMediaChange = useCallback(
    (messageId: string | null) => {
      setOpenMedia(
        messageId && conversationId ? { conversationId, messageId } : null,
      );
    },
    [conversationId],
  );

  // Fetch messages whenever the selected conversation changes. Kept
  // separate from the unread-reset effect so that incoming messages
  // arriving while the thread is open don't trigger a full refetch —
  // they only flip hasUnread, which only the reset effect listens to.
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch messages:", error);
      } else {
        onMessagesLoadedRef.current(data ?? []);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus —
    // realtime is best-effort and any message events sent while the WS
    // was disconnected or throttled are otherwise lost.
  }, [conversationId, resyncToken]);

  // Reactions fetch — pulls the current state from the DB. Kept separate
  // from the channel subscription below so a `resyncToken` bump just
  // refetches the rows without also tearing down and rebuilding the
  // realtime channel.
  useEffect(() => {
    if (!conversationId) {
      setReactions([]);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("*")
        .eq("conversation_id", conversationId);
      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch reactions:", error);
        return;
      }
      setReactions((data as MessageReaction[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, resyncToken]);

  // Reactions realtime subscription per conversation. Subscribing here
  // (not at the page level) keeps the channel scoped to the visible
  // conversation and avoids cross-conversation chatter on a busy inbox.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`reactions:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            // Swap any matching optimistic temp row for the real one so
            // the pill doesn't double up after a successful POST.
            const tempIdx = prev.findIndex(
              (r) =>
                r.id.startsWith("temp-") &&
                r.message_id === row.message_id &&
                r.actor_type === row.actor_type &&
                r.actor_id === row.actor_id,
            );
            if (tempIdx >= 0) {
              const copy = prev.slice();
              copy[tempIdx] = row;
              return copy;
            }
            return [...prev, row];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => prev.map((r) => (r.id === row.id ? row : r)));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as Partial<MessageReaction>;
          if (!old?.id) return;
          setReactions((prev) => prev.filter((r) => r.id !== old.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Clear any in-progress reply draft when the active conversation changes —
  // a quote pulled from conversation A shouldn't bleed into conversation B.
  useEffect(() => {
    setReplyTo(null);
  }, [conversationId]);

  // Reset the server-side unread_count to 0 whenever an unread count
  // surfaces on the active conversation — covers both (a) opening a
  // conversation that had unread messages and (b) new messages arriving
  // while the user is already viewing the thread (webhook server-bumps
  // unread_count to N+1; the realtime UPDATE propagates it into the
  // client, which re-runs this effect and flips it back to 0).
  //
  // Guarding on hasUnread prevents the eq-update loop: once unread_count
  // is 0 the condition is false, so no further UPDATE is issued.
  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    const supabase = createClient();
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
      .then(({ error }) => {
        if (error) console.error("Failed to reset unread_count:", error);
      });
  }, [conversationId, hasUnread]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text: string, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;

      // Optimistic update — shows the message immediately with "sent" status
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "text",
        content_text: text,
        status: "sent",
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "text",
            content_text: text,
            reply_to_message_id: replyToId,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error("Failed to send message:", reason);
          toast.error(`Failed to send: ${reason}`);
          // Mark the optimistic bubble as failed so the user sees what happened
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        // Success — the realtime INSERT event will replace the temp bubble
        // with the real DB row.
      } catch (err) {
        console.error("Failed to send message:", err);
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleSendMedia = useCallback(
    async (payload: SendMediaPayload) => {
      if (!conversation) return;

      // Documents show their filename in our own bubble (and to the
      // recipient as the Meta caption when no caption was typed); other
      // kinds use the caption as-is. Audio carries no caption.
      const contentText =
        payload.kind === "document"
          ? payload.caption || payload.filename || "Document"
          : payload.caption;

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: payload.kind,
        content_text: contentText,
        media_url: payload.mediaUrl,
        status: "sent",
        created_at: new Date().toISOString(),
        reply_to_message_id: payload.replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: payload.kind,
            media_url: payload.mediaUrl,
            content_text: contentText,
            filename: payload.filename,
            reply_to_message_id: payload.replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error("Failed to send media:", reason);
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: "failed" });
          // The upload never reached the recipient — GC the orphaned
          // object rather than leaving it in the public bucket forever.
          if (payload.path) {
            void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(() => {});
          }
          return;
        }

        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        console.error("Failed to send media:", err);
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
        if (payload.path) {
          void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(() => {});
        }
      }
    },
    [conversation, onNewMessage, onUpdateMessage],
  );

  const handleSendInteractive = useCallback(
    async (payload: InteractiveMessagePayload, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      // Optimistic bubble — renders the buttons/list immediately via the
      // interactive_payload, same as the persisted row will.
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "interactive",
        content_text: payload.body,
        interactive_payload: payload,
        status: "sending",
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "interactive",
            interactive_payload: payload,
            reply_to_message_id: replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error("Failed to send interactive message:", reason);
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        console.error("Failed to send interactive message:", err);
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage],
  );

  const handleStatusChange = useCallback(
    async (status: ConversationStatus) => {
      if (!conversation) return;

      const supabase = createClient();
      await supabase
        .from("conversations")
        .update({ status })
        .eq("id", conversation.id);

      onStatusChange(conversation.id, status);
    },
    [conversation, onStatusChange]
  );

  const handleOpenTemplates = useCallback(() => {
    setTemplateModalOpen(true);
  }, []);

  const handleSendTemplate = useCallback(
    async (
      template: MessageTemplate,
      values: {
        body: string[];
        headerText?: string;
        buttonParams?: Record<number, string>;
      },
    ) => {
      if (!conversation) return;

      const renderedBody = renderTemplateBody(template.body_text, values.body);
      const tempId = `temp-${Date.now()}`;

      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "template",
        content_text: renderedBody,
        template_name: template.name,
        status: "sending",
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "template",
            template_name: template.name,
            template_language: template.language,
            // Structured params drive the new send-builder path
            // (header media + URL button substitution). Body values
            // are mirrored under both shapes so the route can fall
            // back if the template row isn't found locally.
            template_message_params: {
              body: values.body,
              headerText: values.headerText,
              buttonParams: values.buttonParams,
            },
            template_params: values.body,
            content_text: renderedBody,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error("Failed to send template:", reason);
          toast.error(`Failed to send template: ${reason}`);
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        console.error("Failed to send template:", err);
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send template: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage],
  );

  // Build a quick id → Message map so reply quotes can be rendered without
  // an extra fetch — the thread already holds the full conversation.
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Images + videos in the thread, in order — the set the media viewer
  // pages through with ← / →.
  const mediaGallery = useMemo(() => collectMediaGallery(messages), [messages]);

  // Bucket reactions by their target message_id for O(1) per-bubble lookup.
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();
    for (const r of reactions) {
      const bucket = map.get(r.message_id);
      if (bucket) bucket.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  // Author label for a quoted message: "You" when we sent the parent,
  // contact name when the customer sent it.
  const authorLabelFor = useCallback(
    (m: Message): string => {
      const isAgentMsg =
        m.sender_type === "agent" || m.sender_type === "bot";
      return isAgentMsg ? "You" : contactDisplayName;
    },
    [contactDisplayName],
  );

  const handleStartReply = useCallback(
    (msg: Message) => {
      setReplyTo({
        id: msg.id,
        authorLabel: authorLabelFor(msg),
        preview: buildReplyPreview(msg, tQuote),
      });
    },
    [authorLabelFor],
  );

  // Single reaction-set primitive. emoji === "" removes; otherwise adds/swaps.
  // The "toggle" semantic (pill click) is computed at the call site where the
  // current reactions for the bubble are already in scope — keeps this
  // function dependency-free w.r.t. the reaction list.
  const postReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id || !conversation) {
        console.warn("[reactions] missing user or conversation");
        return;
      }
      if (messageId.startsWith("temp-")) {
        toast.error("Wait for the message to finish sending");
        return;
      }

      const convId = conversation.id;
      const userId = user.id;
      let snapshot: MessageReaction[] = [];

      // Functional updater — captures the freshest reactions list, never a
      // stale closure. Snapshot stored for rollback on POST failure.
      setReactions((prev) => {
        snapshot = prev;
        const own = prev.find(
          (r) =>
            r.message_id === messageId &&
            r.actor_type === "agent" &&
            r.actor_id === userId,
        );
        if (emoji === "") return own ? prev.filter((r) => r !== own) : prev;
        if (own) return prev.map((r) => (r === own ? { ...own, emoji } : r));
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            message_id: messageId,
            conversation_id: convId,
            actor_type: "agent",
            actor_id: userId,
            emoji,
            created_at: new Date().toISOString(),
          },
        ];
      });

      try {
        const res = await fetch("/api/whatsapp/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: messageId, emoji }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Reaction failed: ${reason}`);
        setReactions(snapshot);
      }
    },
    [conversation, user?.id],
  );

  const handleAssignChange = useCallback(
    async (agentId: string | null) => {
      if (!conversation) return;

      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ assigned_agent_id: agentId })
        .eq("id", conversation.id);

      if (error) {
        console.error("Failed to update assignment:", error);
        toast.error("Failed to update assignment");
        return;
      }

      onAssignChange(conversation.id, agentId);
    },
    [conversation, onAssignChange],
  );

  // Empty state — same WhatsApp-style doodle background as the active
  // thread below, so swapping between empty/selected doesn't change the
  // pattern under the user's eye.
  if (!conversation || !contact) {
    return (
      <div className={cn("flex flex-1 flex-col items-center justify-center", DOODLE_BG_CLASSES)}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-muted-foreground">
          {t("selectConversation")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("selectConversationHint")}
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const messageGroups = groupMessagesByDate(messages);
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === conversation.status
  );
  const assignedAgentId = conversation.assigned_agent_id ?? null;
  const currentAssignee = profiles.find((p) => p.user_id === assignedAgentId);
  const assignLabel = assignedAgentId
    ? (currentAssignee?.full_name ?? t("assigned"))
    : t("assign");

  return (
    // `min-w-0` is load-bearing: the page already puts min-w-0 on the
    // thread's flex *wrapper* (issue #165), but this root keeps the
    // default `min-width: auto`, so a single wide message (long unbroken
    // URL/word) expands the whole thread past its flex share and the chat
    // paints on top of the contact sidebar at lg+ — outgoing bubbles get
    // clipped and the hover toolbar overlaps the Tags panel. Letting the
    // root shrink lets the bubbles' break-words / max-w caps apply.
    // Issue #257.
    <div className={cn("flex min-w-0 flex-1 flex-col", DOODLE_BG_CLASSES)}>
      {/* Header — solid card surface sits on top of the doodle so the
          name/avatar/dropdowns stay legible. */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Back-to-list button — mobile only. Hidden on lg+ where the
              conversation list is always visible next to the thread. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t("backToConversations")}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{displayName}</h2>
            <p className="truncate text-xs text-muted-foreground">{contact.phone}</p>
          </div>
          <Badge
            variant="outline"
            className="ml-1 hidden gap-1 border-border text-[10px] text-emerald-400 sm:inline-flex sm:ml-2"
          >
            <span className="size-1.5 rounded-full bg-emerald-400" />
            WhatsApp Web
          </Badge>

          {/* Facebook Ad Referral Badge */}
          {(contact.utm_campaign || contact.ad_title || contact.utm_source) && (
            <Badge
              variant="outline"
              className="ml-1 hidden max-w-44 items-center gap-1 truncate border-blue-500/30 bg-blue-500/10 text-[10px] font-medium text-blue-400 sm:inline-flex"
              title={`Facebook Ad: ${contact.ad_title || contact.utm_campaign || "Ad Referral"}`}
            >
              <Globe className="size-2.5 shrink-0" />
              <span className="truncate">{contact.ad_title || contact.utm_campaign || "FB Ad Lead"}</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Create Deal Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setNewDealTitle(`Deal with ${contactDisplayName}`);
              setCreateDealModalOpen(true);
            }}
            className="h-7 gap-1 px-2 text-xs border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
            title="Create Deal in CRM Pipeline for this contact"
          >
            <Plus className="size-3.5" />
            <span className="hidden md:inline">Create Deal</span>
          </Button>

          {/* Log Conversion (Meta CAPI) Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConversionModalOpen(true)}
            className="h-7 gap-1 px-2 text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
            title="Log Sale or Qualify Lead (Syncs with CRM & Facebook Pixel)"
          >
            <DollarSign className="size-3.5" />
            <span className="hidden sm:inline">Log Sale</span>
          </Button>

          {/* Direct Call & Video Call Buttons */}
          <a
            href={`tel:${contact.phone}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Start Voice Call"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-emerald-400 transition-colors"
          >
            <Phone className="h-4 w-4" />
          </a>
          <a
            href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open WhatsApp Direct Call"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-emerald-400 transition-colors"
          >
            <Video className="h-4 w-4" />
          </a>
          {/* Contact-panel toggle — desktop only. The contact sidebar
              eats a chunk of horizontal width that crowds the thread on
              smaller laptops; this lets agents reclaim it when they just
              want to read and reply. Hidden on mobile, where the sidebar
              never renders as a permanent panel anyway. Issue #258. */}
          {onToggleContactPanel && (
            <button
              type="button"
              onClick={onToggleContactPanel}
              aria-label={
                contactPanelOpen ? t("hideContactPanel") : t("showContactPanel")
              }
              title={contactPanelOpen ? t("hideContact") : t("showContact")}
              aria-pressed={contactPanelOpen}
              className={cn(
                "hidden h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground lg:inline-flex",
                contactPanelOpen ? "text-primary" : "text-muted-foreground",
              )}
            >
              {contactPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Manual refresh — forces a refetch of the messages + the
              conversation list (the parent bumps its resyncToken). Useful
              when realtime missed an event or the agent just wants to be
              sure nothing's stale. Only rendered when the parent wires
              up `onRefresh`. */}
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              aria-label={t("refreshConversation")}
              title={t("refresh")}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60",
              )}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
              />
            </button>
          )}

          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
                  "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  currentStatus?.color ?? "text-muted-foreground"
                )}>
                {currentStatus ? t(`status${currentStatus.label}`) : t("status")}
                <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-popover"
            >
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn("text-sm", opt.color)}
                >
                  {t(`status${opt.label}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                assignedAgentId ? "text-primary" : "text-muted-foreground"
              )}
            >
              <UserPlus className="h-3 w-3" />
              <span className="hidden sm:inline">{assignLabel}</span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-popover"
            >
              {profiles.length === 0 ? (
                <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                  {t("noTeammates")}
                </DropdownMenuItem>
              ) : (
                profiles.map((p) => {
                  const isSelected = p.user_id === assignedAgentId;
                  const presence = getPresence(p.user_id);
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleAssignChange(p.user_id)}
                      className={cn(
                        "text-sm",
                        isSelected ? "text-primary" : "text-popover-foreground"
                      )}
                    >
                      <PresenceDot
                        status={presence}
                        label={presenceLabel(
                          presence,
                          getRow(p.user_id)?.last_seen_at ?? null,
                          now
                        )}
                        className="mr-2"
                      />
                      <span className="flex-1">
                        {p.full_name}
                        {p.user_id === user?.id ? t("me") : ""}
                      </span>
                      {isSelected && <Check className="ml-2 h-3 w-3" />}
                    </DropdownMenuItem>
                  );
                })
              )}
              {assignedAgentId && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    onClick={() => handleAssignChange(null)}
                    className="text-sm text-muted-foreground"
                  >
                    {t("unassign")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Chat History from CRM button */}
          <button
            type="button"
            onClick={() => setClearChatModalOpen(true)}
            title="Clear Chat History from CRM (Free Storage)"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">{t("noMessagesYet")}</p>
            <p className="text-xs text-muted-foreground">
              {t("sendTemplateHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                    {formatDateSeparator(group.date, t)}
                  </span>
                </div>
                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => {
                    const parent = msg.reply_to_message_id
                      ? messagesById.get(msg.reply_to_message_id)
                      : null;
                    const reply = parent
                      ? {
                          authorLabel:
                            parent.sender_type === "agent" || parent.sender_type === "bot"
                              ? t("me") 
                              : contact?.name || contact?.phone || "Unknown",
                          preview: buildReplyPreview(parent, tQuote),
                        }
                      : null;
                    const msgReactions = reactionsByMessageId.get(msg.id);
                    // Toggle is computed at the call site — `msgReactions`
                    // and `user?.id` are already in scope, no extra hook.
                    const handlePillToggle = (emoji: string) => {
                      const own = msgReactions?.find(
                        (r) =>
                          r.actor_type === "agent" &&
                          r.actor_id === user?.id,
                      );
                      const next = own?.emoji === emoji ? "" : emoji;
                      void postReaction(msg.id, next);
                    };
                    return (
                      <MessageActions
                        key={msg.id}
                        message={msg}
                        onReply={() => handleStartReply(msg)}
                        onReact={(emoji) => {
                          if (emoji) void postReaction(msg.id, emoji);
                        }}
                      >
                        <MessageBubble
                          message={msg}
                          reply={reply}
                          reactions={msgReactions}
                          currentUserId={user?.id}
                          onToggleReaction={handlePillToggle}
                          onOpenMedia={handleMediaChange}
                        />
                      </MessageActions>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI auto-reply banner — take over an active bot, or resume it
          after a handoff. Renders nothing unless the account has
          auto-reply configured. */}
      <AiThreadBanner
        conversationId={conversation.id}
        disabled={conversation.ai_autoreply_disabled ?? false}
        handoffSummary={conversation.ai_handoff_summary}
        assignedAgentId={assignedAgentId}
        currentUserId={user?.id}
        onChange={(patch) => {
          if ("assigned_agent_id" in patch) {
            onAssignChange(conversation.id, patch.assigned_agent_id ?? null);
          }
        }}
      />

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        sessionExpired={sessionInfo.expired}
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        onSendInteractive={handleSendInteractive}
        onOpenTemplates={handleOpenTemplates}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
      />

      <TemplatePicker
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        onSelect={handleSendTemplate}
      />

      {/* Full-size viewer for the thread's images/videos. Renders nothing
          until a bubble opens it. */}
      <MediaLightbox
        items={mediaGallery}
        activeId={mediaMessageId}
        onActiveIdChange={handleMediaChange}
        contactLabel={contactDisplayName}
      />

      {/* Create Deal Directly from Chat Modal */}
      <Dialog open={createDealModalOpen} onOpenChange={setCreateDealModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Plus className="size-5 text-primary" />
              Create Deal in CRM Pipeline
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              Creating a deal for <strong className="text-foreground">{contactDisplayName}</strong> ({contact.phone}). It will be automatically added to the <strong>&quot;{pipelines[0]?.stages?.[0]?.name || "New Lead"}&quot;</strong> stage on your Kanban board.
            </div>

            {offerings.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>✨ Quick Offering / Template (Optional)</span>
                  <span className="text-[10px] opacity-75">Click to auto-fill & edit</span>
                </label>
                <select
                  onChange={(e) => {
                    const match = offerings.find((o) => o.id === e.target.value);
                    if (match) {
                      setNewDealTitle(match.title);
                      setNewDealValue(String(match.value || ""));
                      if (match.currency) setNewDealCurrency(match.currency);
                      if (match.description) setNewDealDescription(match.description);
                    }
                  }}
                  defaultValue=""
                  className="flex h-10 w-full rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="" disabled>
                    -- Choose from predefined offerings or type custom below --
                  </option>
                  {offerings.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} — {o.currency || defaultCurrency} {Number(o.value || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Deal Title
              </label>
              <Input
                value={newDealTitle}
                onChange={(e) => setNewDealTitle(e.target.value)}
                placeholder={`e.g. Deal with ${contactDisplayName}`}
                className="bg-muted text-foreground border-border text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Deal Amount / Offer Value
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newDealValue}
                  onChange={(e) => setNewDealValue(e.target.value)}
                  placeholder="e.g. 500.00"
                  className="bg-muted text-foreground border-border text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Currency
                </label>
                <select
                  value={newDealCurrency}
                  onChange={(e) => setNewDealCurrency(e.target.value)}
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
                Deal Description & Deliverables
              </label>
              <textarea
                value={newDealDescription}
                onChange={(e) => setNewDealDescription(e.target.value)}
                placeholder="Details of the offer, packages, scope, notes..."
                rows={2}
                className="w-full rounded-md border border-border bg-muted p-2 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateDealModalOpen(false)}
              disabled={creatingDeal}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateDeal}
              disabled={creatingDeal}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creatingDeal ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Creating Deal...
                </>
              ) : (
                "Create & Add to Pipeline"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Conversion & Kanban Pipeline Synchronizer Modal */}
      <Dialog open={conversionModalOpen} onOpenChange={setConversionModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <DollarSign className="size-5 text-emerald-400" />
              Log Sale & CRM Stage Sync
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {contactDeals.length === 0 ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300">
                  ⚠️ <strong>No Active Deal Found:</strong>
                  <p className="mt-1 text-muted-foreground">
                    You cannot mark this lead as Qualified or Won because there is no offer or deal created for <strong className="text-foreground">{contactDisplayName}</strong> yet.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    setConversionModalOpen(false);
                    setNewDealTitle(`Deal with ${contactDisplayName}`);
                    setCreateDealModalOpen(true);
                  }}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                >
                  <Plus className="mr-1.5 size-4" />
                  Create Deal for this Customer First
                </Button>
              </div>
            ) : (
              <>
                {/* Active Deal Selector */}
                <div className="rounded-xl border border-border/60 bg-muted/40 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Target Deal:</span>
                    {contactDeals.find((d) => d.id === selectedDealId)?.stage && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: `${contactDeals.find((d) => d.id === selectedDealId)?.stage?.color || "#3b82f6"}20`,
                          color: contactDeals.find((d) => d.id === selectedDealId)?.stage?.color || "#3b82f6",
                        }}
                      >
                        Stage: {contactDeals.find((d) => d.id === selectedDealId)?.stage?.name}
                      </span>
                    )}
                  </div>
                  {contactDeals.length === 1 ? (
                    <div className="text-sm font-semibold text-foreground">
                      {contactDeals[0].title} — {contactDeals[0].currency || defaultCurrency} {Number(contactDeals[0].value || 0).toLocaleString()}
                    </div>
                  ) : (
                    <select
                      value={selectedDealId}
                      onChange={(e) => {
                        setSelectedDealId(e.target.value);
                        const match = contactDeals.find((d) => d.id === e.target.value);
                        if (match?.value) setConversionAmount(String(match.value));
                        if (match?.currency) setConversionCurrency(match.currency);
                      }}
                      className="flex h-9 w-full rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
                    >
                      {contactDeals.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} ({d.currency || defaultCurrency} {d.value})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Action to Perform:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={conversionEvent === "Purchase" ? "default" : "outline"}
                      onClick={() => setConversionEvent("Purchase")}
                      className={cn(
                        "text-xs flex-col h-auto py-2",
                        conversionEvent === "Purchase" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-border"
                      )}
                    >
                      <span className="font-semibold">💰 Won Deal (Sale)</span>
                      <span className="text-[10px] opacity-80">Move to Won & Push Pixel</span>
                    </Button>
                    <Button
                      type="button"
                      variant={conversionEvent === "Lead" ? "default" : "outline"}
                      onClick={() => setConversionEvent("Lead")}
                      className={cn(
                        "text-xs flex-col h-auto py-2",
                        conversionEvent === "Lead" ? "bg-blue-600 text-white hover:bg-blue-700" : "border-border"
                      )}
                    >
                      <span className="font-semibold">🌟 Qualified Lead</span>
                      <span className="text-[10px] opacity-80">Move to Qualified Stage</span>
                    </Button>
                  </div>
                </div>

                {conversionEvent === "Purchase" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Confirmed Sale Amount
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={conversionAmount}
                        onChange={(e) => setConversionAmount(e.target.value)}
                        placeholder="e.g. 500.00"
                        className="bg-muted text-foreground border-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Currency
                      </label>
                      <select
                        value={conversionCurrency}
                        onChange={(e) => setConversionCurrency(e.target.value)}
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
                )}
              </>
            )}
          </div>
          {contactDeals.length > 0 && (
            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConversionModalOpen(false)}
                disabled={loggingConversion}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleLogConversion}
                disabled={loggingConversion}
                className={cn(
                  "text-white",
                  conversionEvent === "Purchase" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                {loggingConversion ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Syncing CRM & Meta...
                  </>
                ) : conversionEvent === "Purchase" ? (
                  "Confirm Sale & Move to WON"
                ) : (
                  "Mark Qualified & Move on Kanban"
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear Chat Confirmation Modal */}
      <Dialog open={clearChatModalOpen} onOpenChange={setClearChatModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Trash2 className="size-5 text-red-400" />
              Clear Chat History from CRM?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs text-muted-foreground">
            <p>
              This will delete all message bubbles and media attachments for{" "}
              <strong className="text-foreground">{contactDisplayName}</strong> from your Supabase database to free storage.
            </p>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">
              ✅ <strong>What is kept:</strong> The customer&apos;s contact card, phone number, deals, notes, and Facebook conversion records are permanently saved. The chat also remains intact on your WhatsApp phone.
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearChatModalOpen(false)}
              disabled={clearingChat}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleClearChatFromCrm}
              disabled={clearingChat}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {clearingChat ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Clearing Chat...
                </>
              ) : (
                "Clear Messages from CRM"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
