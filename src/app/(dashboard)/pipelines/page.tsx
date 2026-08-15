"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage, Deal } from "@/types";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineSettings } from "@/components/pipelines/pipeline-settings";
import { DealForm } from "@/components/pipelines/deal-form";
import { CrmDashboard } from "@/components/crm/crm-dashboard";
import { CrmArchiveGrid } from "@/components/crm/crm-archive-grid";
import { CrmActivitiesView } from "@/components/crm/crm-activities-view";
import { DealDetailWorkspace } from "@/components/crm/deal-detail-workspace";
import { WonReasonModal, LostReasonModal } from "@/components/crm/won-lost-modals";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GitBranch,
  Plus,
  ChevronDown,
  Settings,
  TrendingUp,
  LayoutGrid,
  Trophy,
  XCircle,
  Archive,
  Clock,
  Package,
} from "lucide-react";
import { OfferingsManager } from "@/components/crm/offerings-manager";
import { ScheduleView } from "@/components/crm/schedule-view";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { useAuth } from "@/hooks/use-auth";
import { GatedButton } from "@/components/ui/gated-button";
import { useTranslations } from "next-intl";

type CrmViewTab = "dashboard" | "active" | "schedule" | "won" | "lost" | "archive" | "offerings";

const SPEC_DEFAULT_STAGES = [
  { name: "New Lead", color: "#3b82f6", position: 0 },
  { name: "Qualified", color: "#eab308", position: 1 },
  { name: "Proposal Sent", color: "#f97316", position: 2 },
  { name: "Negotiation", color: "#8b5cf6", position: 3 },
  { name: "Won", color: "#22c55e", position: 4 },
];

export default function PipelinesPage() {
  return (
    <Suspense fallback={null}>
      <PipelinesPageInner />
    </Suspense>
  );
}

function PipelinesPageInner() {
  const t = useTranslations("Pipelines.page");
  const supabase = createClient();
  const searchParams = useSearchParams();
  const canEditSettings = useCan("edit-settings");
  const canCreateDeals = useCan("send-messages");
  const { accountId, user } = useAuth();

  const viewParam = searchParams.get("view") as CrmViewTab | null;
  const [currentView, setCurrentView] = useState<CrmViewTab>(
    viewParam && ["dashboard", "active", "schedule", "won", "lost", "archive", "offerings"].includes(viewParam)
      ? viewParam
      : "dashboard"
  );

  useEffect(() => {
    if (viewParam && ["dashboard", "active", "schedule", "won", "lost", "archive", "offerings"].includes(viewParam)) {
      setCurrentView(viewParam);
    }
  }, [viewParam]);

  const switchView = (view: CrmViewTab) => {
    setCurrentView(view);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      window.history.pushState({}, "", url.toString());
    }
  };

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog / sheet state
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Deal form & Detail workspace state
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>("");
  const [detailWorkspaceDealId, setDetailWorkspaceDealId] = useState<string | null>(null);

  // Won / Lost modal triggers
  const [wonModalOpen, setWonModalOpen] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [targetTransitionDeal, setTargetTransitionDeal] = useState<Deal | null>(null);

  const seedAttempted = useRef(false);

  const loadPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .order("created_at");
    if (error) {
      console.error("Failed to load pipelines:", error.message);
      return [];
    }
    return data ?? [];
  }, [supabase]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      return data ?? [];
    },
    [supabase],
  );

  const loadDeals = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("deals")
        .select("*, contact:contacts(*), assignee:profiles!deals_assigned_to_fkey(*)")
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Deal[];
    },
    [supabase],
  );

  const seedDefaultPipeline = useCallback(async (): Promise<Pipeline | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const currentUser = session?.user;
    if (!currentUser || !accountId) return null;

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: currentUser.id, account_id: accountId, name: "Sales Pipeline" })
      .select()
      .single();

    if (error || !pipeline) {
      console.error("Failed to seed pipeline:", error?.message);
      return null;
    }

    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);

    return pipeline as Pipeline;
  }, [supabase, accountId]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let list = await loadPipelines();

      if (list.length === 0 && !seedAttempted.current) {
        seedAttempted.current = true;
        const seeded = await seedDefaultPipeline();
        if (seeded) list = await loadPipelines();
      }

      if (cancelled) return;
      setPipelines(list);
      if (list.length > 0) {
        setSelectedPipelineId((prev) =>
          prev && list.some((p) => p.id === prev) ? prev : list[0].id,
        );
      } else {
        setSelectedPipelineId("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, seedDefaultPipeline]);

  // Load stages + deals
  useEffect(() => {
    if (!selectedPipelineId) {
      setStages([]);
      setDeals([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [s, d] = await Promise.all([
        loadStages(selectedPipelineId),
        loadDeals(selectedPipelineId),
      ]);
      if (cancelled) return;
      setStages(s);
      setDeals(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPipelineId, loadStages, loadDeals]);

  const refreshPipelines = useCallback(async () => {
    const list = await loadPipelines();
    setPipelines(list);
    if (list.length === 0) setSelectedPipelineId("");
    else if (!list.some((p) => p.id === selectedPipelineId))
      setSelectedPipelineId(list[0].id);
  }, [loadPipelines, selectedPipelineId]);

  const refreshStages = useCallback(async () => {
    if (!selectedPipelineId) return;
    setStages(await loadStages(selectedPipelineId));
  }, [loadStages, selectedPipelineId]);

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setDeals(await loadDeals(selectedPipelineId));
  }, [loadDeals, selectedPipelineId]);

  // Handle Drag and Drop with Won/Lost Lifecycle Prompts
  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      const targetStage = stages.find((s) => s.id === newStageId);
      const movedDeal = deals.find((d) => d.id === dealId);
      if (!targetStage || !movedDeal) return;

      const stageName = targetStage.name.toLowerCase();
      const isWonStage = /won|closed won|converted/i.test(stageName);
      const isLostStage = /lost|closed lost|dropped/i.test(stageName);

      if (isWonStage) {
        setTargetTransitionDeal(movedDeal);
        setWonModalOpen(true);
        return;
      }

      if (isLostStage) {
        setTargetTransitionDeal(movedDeal);
        setLostModalOpen(true);
        return;
      }

      // Regular active stage move
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)),
      );

      const { error } = await supabase
        .from("deals")
        .update({ stage_id: newStageId, last_activity_at: new Date().toISOString() })
        .eq("id", dealId);

      if (error) {
        toast.error(t("toastFailedMoveDeal"));
        refreshDeals();
      } else {
        // Record transition activity
        void fetch("/api/crm/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deal_id: dealId,
            contact_id: movedDeal.contact_id,
            type: "stage_change",
            title: `Moved to "${targetStage.name}" stage`,
            status: "completed",
          }),
        });
      }
    },
    [stages, deals, supabase, refreshDeals, t],
  );

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? stages[0]?.id ?? "");
      setDealFormOpen(true);
    },
    [stages],
  );

  const handleCardClicked = useCallback((deal: Deal) => {
    setDetailWorkspaceDealId(deal.id);
  }, []);

  async function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name || !accountId || !user?.id) return;
    setCreating(true);

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name })
      .select()
      .single();

    if (error || !pipeline) {
      toast.error(t("toastFailedCreatePipeline"));
      setCreating(false);
      return;
    }

    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);

    setNewPipelineName("");
    setNewPipelineOpen(false);
    setSelectedPipelineId(pipeline.id);
    await refreshPipelines();
    setCreating(false);
    toast.success(t("toastPipelineCreated"));
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  // Active Deals Only for the Main Kanban Board (WON and LOST disappear from active board!)
  const activeDeals = deals.filter((d) => d.status === "open" || !d.status);
  const wonDeals = deals.filter((d) => d.status === "won");
  const lostDeals = deals.filter((d) => d.status === "lost");

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-96 w-72 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Pipeline selector dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground hover:bg-muted transition-colors data-[popup-open]:bg-muted shadow-xs font-medium">
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="font-semibold">
                {selectedPipeline?.name ?? t("selectPipeline")}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 border-border bg-popover text-popover-foreground shadow-lg">
              {pipelines.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {t("noPipelinesYet")}
                </DropdownMenuItem>
              )}
              {pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setSelectedPipelineId(p.id)}
                  className={p.id === selectedPipelineId ? "text-primary font-semibold" : "text-popover-foreground"}
                >
                  <GitBranch className="mr-2 h-3.5 w-3.5" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              {selectedPipeline && (
                <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="text-popover-foreground">
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  {t("managePipelines")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="border-border bg-card text-foreground hover:bg-muted text-xs h-9"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("addPipeline")}
          </GatedButton>
          <GatedButton
            canAct={canCreateDeals}
            gateReason="create deals"
            disabled={!selectedPipelineId || stages.length === 0}
            onClick={() => handleAddDeal()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-9"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("addDeal")}
          </GatedButton>
        </div>
      </div>

      {/* Main View Switcher */}
      {currentView === "dashboard" && <CrmDashboard />}

      {currentView === "offerings" && <OfferingsManager />}

      {currentView === "archive" && (
        <CrmArchiveGrid
          deals={deals}
          stages={stages}
          onSelectDeal={(dealId) => setDetailWorkspaceDealId(dealId)}
        />
      )}

      {currentView === "won" && (
        <CrmArchiveGrid
          deals={wonDeals}
          stages={stages}
          onSelectDeal={(dealId) => setDetailWorkspaceDealId(dealId)}
        />
      )}

      {currentView === "lost" && (
        <CrmArchiveGrid
          deals={lostDeals}
          stages={stages}
          onSelectDeal={(dealId) => setDetailWorkspaceDealId(dealId)}
        />
      )}

      {currentView === "schedule" && (
        <ScheduleView
          onSelectDeal={(dealId) => setDetailWorkspaceDealId(dealId)}
        />
      )}

      {currentView === "active" && (
        <>
          {pipelines.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 bg-card">
              <GitBranch className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium text-foreground">{t("noPipelinesYet")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t("createToStartTracking")}</p>
              <GatedButton
                canAct={canEditSettings}
                gateReason="create pipelines"
                onClick={() => setNewPipelineOpen(true)}
                className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="mr-1 h-4 w-4" />
                {t("createPipeline")}
              </GatedButton>
            </div>
          ) : (
            <PipelineBoard
              stages={stages}
              deals={activeDeals}
              onDealMoved={handleDealMoved}
              onAddDeal={handleAddDeal}
              onEditDeal={handleCardClicked}
            />
          )}
        </>
      )}

      {/* Full Lead / Deal Detail Workspace Sliding Drawer */}
      <DealDetailWorkspace
        open={!!detailWorkspaceDealId}
        onOpenChange={(open) => {
          if (!open) setDetailWorkspaceDealId(null);
        }}
        dealId={detailWorkspaceDealId}
        stages={stages}
        onDealUpdated={refreshDeals}
      />

      {/* Drag-to-Won Modal */}
      <WonReasonModal
        open={wonModalOpen}
        onOpenChange={setWonModalOpen}
        deal={targetTransitionDeal}
        onSuccess={() => {
          setTargetTransitionDeal(null);
          refreshDeals();
        }}
      />

      {/* Drag-to-Lost Modal */}
      <LostReasonModal
        open={lostModalOpen}
        onOpenChange={setLostModalOpen}
        deal={targetTransitionDeal}
        onSuccess={() => {
          setTargetTransitionDeal(null);
          refreshDeals();
        }}
      />

      {/* New Pipeline Dialog */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t("newPipeline")}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-muted-foreground">{t("pipelineName")}</Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder={t("pipelineNamePlaceholder")}
              className="mt-2 bg-muted border-border text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePipeline();
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">{t("defaultStagesDesc")}</p>
          </div>
          <DialogFooter className="bg-popover/50 border-border">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? t("creating") : t("createPipelineBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Settings */}
      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={stages}
          onPipelinesChanged={refreshPipelines}
          onStagesChanged={refreshStages}
          onCreateNewPipeline={() => {
            setSettingsOpen(false);
            setNewPipelineOpen(true);
          }}
        />
      )}

      {/* Add Deal Form */}
      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={selectedPipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        onSaved={refreshDeals}
      />
    </div>
  );
}
