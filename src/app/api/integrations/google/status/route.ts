import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function GET() {
  try {
    const { userId, accountId } = await requireRole("agent");

    const { data: integration } = await supabaseAdmin()
      .from("google_calendar_integrations")
      .select("id, email, is_active, updated_at")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();

    return NextResponse.json({
      connected: !!(integration && integration.is_active),
      email: integration?.email || null,
      updated_at: integration?.updated_at || null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    const { userId, accountId } = await requireRole("agent");

    await supabaseAdmin()
      .from("google_calendar_integrations")
      .delete()
      .eq("account_id", accountId)
      .eq("user_id", userId);

    return NextResponse.json({ ok: true, disconnected: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
