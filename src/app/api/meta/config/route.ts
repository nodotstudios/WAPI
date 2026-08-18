import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data, error } = await supabase
      .from("facebook_ads_config")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data || null });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole("admin");

    const body = await request.json().catch(() => ({}));
    const {
      pixel_id,
      access_token,
      test_event_code,
      currency,
      auto_send_on_deal_won,
      auto_send_stage_id,
      qualified_stage_id,
    } = body;

    const payload = {
      account_id: accountId,
      pixel_id: typeof pixel_id === "string" ? pixel_id.trim() : null,
      access_token: typeof access_token === "string" ? access_token.trim() : null,
      test_event_code: typeof test_event_code === "string" ? test_event_code.trim() : null,
      currency: typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase() : "USD",
      auto_send_on_deal_won: typeof auto_send_on_deal_won === "boolean" ? auto_send_on_deal_won : false,
      auto_send_stage_id: typeof auto_send_stage_id === "string" && auto_send_stage_id.trim() ? auto_send_stage_id.trim() : null,
      qualified_stage_id: typeof qualified_stage_id === "string" && qualified_stage_id.trim() ? qualified_stage_id.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin()
      .from("facebook_ads_config")
      .upsert(payload, { onConflict: "account_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
