import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const conversationId = params.id;
    const { accountId } = await requireRole("agent");

    // 1. Verify conversation belongs to account
    const { data: conversation, error: convErr } = await supabaseAdmin()
      .from("conversations")
      .select("id, contact_id")
      .eq("id", conversationId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (convErr || !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // 2. Delete all messages for this conversation in Supabase
    const { error: delErr, count } = await supabaseAdmin()
      .from("messages")
      .delete({ count: "exact" })
      .eq("conversation_id", conversationId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    // 3. Reset conversation last message summary
    await supabaseAdmin()
      .from("conversations")
      .update({
        last_message_text: null,
        unread_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    return NextResponse.json({
      ok: true,
      purged_count: count ?? 0,
      message: "Chat history cleared from CRM. Contacts, deals, and sales records were preserved.",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
