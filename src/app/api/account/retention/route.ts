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

    // Also get total message count for this account
    const { count: totalMessages } = await supabaseAdmin()
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId);

    return NextResponse.json({
      retention_days: account.chat_retention_days || 0,
      total_messages: totalMessages ?? 0,
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
      const { data: result, error: rpcErr } = await supabaseAdmin().rpc(
        "purge_expired_messages",
        {
          p_account_id: accountId,
          p_retention_days: retentionDaysNumber,
        }
      );

      if (!rpcErr && typeof result === "number") {
        purgedCount = result;
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
