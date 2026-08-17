import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-context";
import { createClient } from "@/lib/supabase/server";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    let accountId: string | null = null;
    let supabase = await createClient();

    try {
      const apiKeyCtx = await requireApiKey(request, "contacts:write");
      accountId = apiKeyCtx.accountId;
      supabase = apiKeyCtx.supabase;
    } catch {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized. Please provide a valid API Key." }, { status: 401, headers: corsHeaders() });
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_id")
        .eq("id", user.id)
        .single();
      if (!profile) {
        return NextResponse.json({ error: "Account not found" }, { status: 404, headers: corsHeaders() });
      }
      accountId = profile.account_id;
    }

    if (!accountId) {
      return NextResponse.json({ error: "Account ID not found" }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders() });
    }

    const { deal_id, contact_id, type, title, description, scheduled_at } = body;

    if (!type || !title) {
      return NextResponse.json({ error: "type and title are required" }, { status: 400, headers: corsHeaders() });
    }

    const { data: activity, error: err } = await supabase
      .from("crm_activities")
      .insert({
        account_id: accountId,
        deal_id: deal_id || undefined,
        contact_id: contact_id || undefined,
        type: type,
        title: title,
        description: description || null,
        scheduled_at: scheduled_at || new Date().toISOString(),
        status: scheduled_at ? "pending" : "completed",
        next_follow_up_at: scheduled_at || undefined,
      })
      .select()
      .single();

    if (err) {
      return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders() });
    }

    return NextResponse.json({
      success: true,
      activity,
    }, { headers: corsHeaders() });
  } catch (err) {
    console.error("Extension Activity API Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
