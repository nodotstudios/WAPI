import { NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { supabaseAdmin } from "@/lib/flows/admin-client";
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
    const authCtx = await authenticateExtensionRequest(request);
    if (!authCtx) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to your WAPI account." },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { accountId, userId } = authCtx;
    const supabase = supabaseAdmin();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders() });
    }

    const { deal_id, contact_id, stage_id, title, value, currency, status, won_reason, lost_reason } = body;

    let targetDealId = deal_id;

    // Ensure we have a valid fallback user ID
    let finalUserId = userId;
    if (!finalUserId) {
      const { data: member } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("account_id", accountId)
        .limit(1)
        .single();
      finalUserId = member?.user_id;
    }

    if (!targetDealId) {
      if (!contact_id) {
        return NextResponse.json({ error: "contact_id or deal_id required" }, { status: 400, headers: corsHeaders() });
      }

      // Fetch default pipeline for account
      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id")
        .eq("account_id", accountId)
        .limit(1)
        .single();

      let pipelineId = pipeline?.id;
      let finalStageId = stage_id;

      if (!finalStageId && pipelineId) {
        const { data: firstStage } = await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", pipelineId)
          .order("position", { ascending: true })
          .limit(1)
          .single();
        finalStageId = firstStage?.id;
      }

      if (!pipelineId || !finalStageId) {
        // Fallback to any stage in account
        const { data: anyStage } = await supabase
          .from("pipeline_stages")
          .select("id, pipeline_id")
          .eq("account_id", accountId)
          .order("position", { ascending: true })
          .limit(1)
          .single();
        if (anyStage) {
          pipelineId = anyStage.pipeline_id;
          finalStageId = anyStage.id;
        }
      }

      // Create new deal
      const { data: newDeal, error: createErr } = await supabase
        .from("deals")
        .insert({
          account_id: accountId,
          user_id: finalUserId,
          pipeline_id: pipelineId,
          contact_id: contact_id,
          title: title || "New Lead via WhatsApp",
          stage_id: finalStageId,
          value: parseFloat(value) || 0,
          currency: currency || "USD",
          status: status || "open",
        })
        .select()
        .single();

      if (createErr || !newDeal) {
        console.error("Deal create error:", createErr);
        return NextResponse.json({ error: createErr?.message || "Failed to create deal" }, { status: 500, headers: corsHeaders() });
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
      updatePayload.last_activity_at = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from("deals")
        .update(updatePayload)
        .eq("id", targetDealId)
        .eq("account_id", accountId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500, headers: corsHeaders() });
      }

      // Record stage history
      if (stage_id) {
        void supabase
          .from("deal_stage_history")
          .insert({
            account_id: accountId,
            deal_id: targetDealId,
            to_stage_id: stage_id,
            user_id: finalUserId || null,
          });
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
