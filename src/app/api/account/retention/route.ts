import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data: account, error } = await supabase
      .from("accounts")
      .select("id, name, chat_retention_days")
      .eq("id", accountId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get conversations for this account
    const { data: convs } = await supabaseAdmin()
      .from("conversations")
      .select("id")
      .eq("account_id", accountId);

    const convIds = (convs || []).map((c) => c.id);
    let totalMessages = 0;

    if (convIds.length > 0) {
      const { count } = await supabaseAdmin()
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("conversation_id", convIds);
      totalMessages = count ?? 0;
    }

    // Estimate storage size (approx 650 bytes per text/media record + metadata)
    const estimatedBytes = totalMessages * 650;
    const mbUsed = Math.max(0.01, estimatedBytes / (1024 * 1024));

    return NextResponse.json({
      retention_days: account.chat_retention_days || 0,
      total_messages: totalMessages,
      estimated_bytes: estimatedBytes,
      storage_mb: parseFloat(mbUsed.toFixed(2)),
      storage_formatted: mbUsed < 0.1 ? `${(estimatedBytes / 1024).toFixed(1)} KB` : `${mbUsed.toFixed(2)} MB`,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole("admin");
    const body = await request.json().catch(() => ({}));
    const { retention_days, trigger_purge_now } = body;

    let retentionDaysNumber = 0;
    if (typeof retention_days === "number") {
      retentionDaysNumber = Math.max(0, retention_days);
    }

    // Update account retention policy
    const { error: updateErr } = await supabaseAdmin()
      .from("accounts")
      .update({ chat_retention_days: retentionDaysNumber })
      .eq("id", accountId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    let purgedCount = 0;
    if (trigger_purge_now && retentionDaysNumber > 0) {
      const { data: convs } = await supabaseAdmin()
        .from("conversations")
        .select("id")
        .eq("account_id", accountId);

      const convIds = (convs || []).map((c) => c.id);
      if (convIds.length > 0) {
        const cutoffDate = new Date(Date.now() - retentionDaysNumber * 24 * 60 * 60 * 1000).toISOString();
        const { error: delErr, count: deleted } = await supabaseAdmin()
          .from("messages")
          .delete({ count: "exact" })
          .in("conversation_id", convIds)
          .lt("created_at", cutoffDate);

        if (!delErr && typeof deleted === "number") {
          purgedCount = deleted;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      retention_days: retentionDaysNumber,
      purged_count: purgedCount,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
