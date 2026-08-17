import { NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { supabaseAdmin } from "@/lib/flows/admin-client";

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
    const authCtx = await authenticateExtensionRequest(request);
    if (!authCtx) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to your WAPI account." },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { accountId } = authCtx;
    const supabase = supabaseAdmin();

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
