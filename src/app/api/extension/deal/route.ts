import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-context";
import { createClient } from "@/lib/supabase/server";
import { sendMetaConversionEvent } from "@/lib/meta/conversions-api";

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
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }
      accountId = profile.account_id;
    }

    if (!accountId) {
      return NextResponse.json({ error: "Account ID not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { deal_id, contact_id, stage_id, title, value, currency, status, won_reason, lost_reason } = body;

    let targetDealId = deal_id;

    if (!targetDealId) {
      if (!contact_id) {
        return NextResponse.json({ error: "contact_id or deal_id required" }, { status: 400 });
      }

      // Create new deal
      const { data: newDeal, error: createErr } = await supabase
        .from("deals")
        .insert({
          account_id: accountId,
          contact_id: contact_id,
          title: title || "New Deal via Extension",
          stage_id: stage_id || undefined,
          value: parseFloat(value) || 0,
          currency: currency || "USD",
          status: status || "open",
        })
        .select()
        .single();

      if (createErr || !newDeal) {
        return NextResponse.json({ error: createErr?.message || "Failed to create deal" }, { status: 500 });
      }
      targetDealId = newDeal.id;
    } else {
      // Update existing deal
      const updatePayload: Record<string, any> = {};
      if (stage_id) updatePayload.stage_id = stage_id;
      if (title) updatePayload.title = title;
      if (value !== undefined) updatePayload.value = parseFloat(value) || 0;
      if (currency) updatePayload.currency = currency;
      if (status) updatePayload.status = status;
      if (won_reason) updatePayload.won_reason = won_reason;
      if (lost_reason) updatePayload.lost_reason = lost_reason;
      if (status === "won") updatePayload.won_at = new Date().toISOString();
      if (status === "lost") updatePayload.lost_at = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from("deals")
        .update(updatePayload)
        .eq("id", targetDealId)
        .eq("account_id", accountId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    }

    // Fetch updated deal details
    const { data: updatedDeal } = await supabase
      .from("deals")
      .select("*, contact:contacts(*), stage:pipeline_stages(*)")
      .eq("id", targetDealId)
      .single();

    // Trigger Meta CAPI Purchase event if deal is marked Won
    let capiSent = false;
    if (status === "won" && updatedDeal) {
      try {
        const { data: capiConfig } = await supabase
          .from("facebook_capi_config")
          .select("*")
          .eq("account_id", accountId)
          .eq("is_enabled", true)
          .single();

        if (capiConfig && capiConfig.pixel_id && capiConfig.access_token) {
          const contact = updatedDeal.contact;
          const res = await sendMetaConversionEvent({
            pixelId: capiConfig.pixel_id,
            accessToken: capiConfig.access_token,
            eventName: "Purchase",
            eventId: `deal_won_${updatedDeal.id}_${Date.now()}`,
            phone: contact?.phone || undefined,
            email: contact?.email || undefined,
            firstName: contact?.name || undefined,
            value: updatedDeal.value || 0,
            currency: updatedDeal.currency || "USD",
            contentName: updatedDeal.title || "Closed Deal",
            testEventCode: capiConfig.test_event_code || undefined,
          });
          capiSent = res.success;
        }
      } catch (err) {
        console.error("CAPI trigger from extension deal route failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      deal: updatedDeal,
      capiSent,
    }, { headers: corsHeaders() });
  } catch (err) {
    console.error("Extension Deal API Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
