"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  Search,
  Filter,
  Download,
  Trophy,
  XCircle,
  ExternalLink,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Deal, PipelineStage } from "@/types";

interface CrmArchiveGridProps {
  deals: Deal[];
  stages: PipelineStage[];
  onSelectDeal: (dealId: string) => void;
}

export function CrmArchiveGrid({ deals, stages, onSelectDeal }: CrmArchiveGridProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "value_high" | "value_low">("newest");

  const filteredDeals = useMemo(() => {
    return deals
      .filter((d) => {
        // Status filter
        if (statusFilter !== "all" && d.status !== statusFilter) return false;

        // Reason filter
        if (reasonFilter !== "all") {
          const r = d.won_reason || d.lost_reason;
          if (r !== reasonFilter) return false;
        }

        // Search text
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchTitle = d.title.toLowerCase().includes(q);
          const matchName = d.contact?.name?.toLowerCase().includes(q);
          const matchPhone = d.contact?.phone?.includes(q);
          if (!matchTitle && !matchName && !matchPhone) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (sortBy === "oldest") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortBy === "value_high") {
          return (b.value || 0) - (a.value || 0);
        }
        if (sortBy === "value_low") {
          return (a.value || 0) - (b.value || 0);
        }
        return 0;
      });
  }, [deals, statusFilter, reasonFilter, search, sortBy]);

  const handleExportCsv = () => {
    if (filteredDeals.length === 0) return;
    const headers = ["Deal ID", "Title", "Customer Name", "Phone", "Value", "Currency", "Status", "Reason", "Created Date", "Closed Date"];
    const rows = filteredDeals.map((d) => [
      d.id,
      `"${d.title.replace(/"/g, '""')}"`,
      `"${(d.contact?.name || "").replace(/"/g, '""')}"`,
      `"${d.contact?.phone || ""}"`,
      d.value || 0,
      d.currency || "USD",
      d.status || "open",
      `"${(d.won_reason || d.lost_reason || "").replace(/"/g, '""')}"`,
      d.created_at,
      d.won_at || d.lost_at || "",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `crm_archive_export_${format(new Date(), "yyyy_MM_dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals, clients, phones..."
              className="h-9 pl-9 text-xs bg-muted border-border"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-muted px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="all">All Statuses</option>
            <option value="open">Active Only</option>
            <option value="won">Won Deals 🏆</option>
            <option value="lost">Lost Deals ❌</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 rounded-lg border border-border bg-muted px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="value_high">Sort: Highest Value</option>
            <option value="value_low">Sort: Lowest Value</option>
          </select>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={filteredDeals.length === 0}
          className="h-9 gap-1.5 text-xs border-border text-foreground hover:bg-muted"
        >
          <Download className="size-3.5" />
          Export CSV ({filteredDeals.length})
        </Button>
      </div>

      {/* Historical Data Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground font-medium">
              <tr>
                <th className="py-3 px-4">Deal Title</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Value</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4">Closed Date</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-muted-foreground">
                    No matching records found.
                  </td>
                </tr>
              ) : (
                filteredDeals.map((deal) => {
                  const isWon = deal.status === "won";
                  const isLost = deal.status === "lost";

                  return (
                    <tr
                      key={deal.id}
                      onClick={() => onSelectDeal(deal.id)}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {deal.title}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        <div>{deal.contact?.name || "—"}</div>
                        {deal.contact?.phone && (
                          <div className="font-mono text-[11px] text-muted-foreground/80">{deal.contact.phone}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-foreground">
                        <span className={isWon ? "text-emerald-400" : isLost ? "text-muted-foreground line-through" : "text-foreground"}>
                          {deal.currency || "$"} {Number(deal.value || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isWon && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-medium">
                            🏆 WON
                          </Badge>
                        )}
                        {isLost && (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-medium">
                            ❌ LOST
                          </Badge>
                        )}
                        {!isWon && !isLost && (
                          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 font-medium">
                            ACTIVE
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {deal.won_reason || deal.lost_reason || "—"}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground font-mono">
                        {format(new Date(deal.created_at), "MMM d, yyyy")}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground font-mono">
                        {deal.won_at || deal.lost_at
                          ? format(new Date(deal.won_at || deal.lost_at!), "MMM d, yyyy")
                          : "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDeal(deal.id);
                          }}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
