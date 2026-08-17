import { NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { sendMetaConversionEvent } from "@/lib/meta/conversions-api";

function cleanPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function DELETE(request: Request) {
  try {
    const authCtx = await authenticateExtensionRequest(request);
    if (!authCtx) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401, headers: corsHeaders() }
      );
    }
    const { accountId } = authCtx;
    const url = new URL(request.url);
    const dealId = url.searchParams.get("deal_id");
    if (!dealId) {
      return NextResponse.json({ error: "deal_id required" }, { status: 400, headers: corsHeaders() });
    }

    await supabaseAdmin()
      .from("deals")
      .delete()
      .eq("id", dealId)
      .eq("account_id", accountId);

    return NextResponse.json({ success: true, deleted: true }, { headers: corsHeaders() });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500, headers: corsHeaders() });
  }
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

    const { deal_id, contact_id, phone: rawPhone, name: rawName, stage_id, title, value, currency, status, won_reason, lost_reason, action } = body;

    // Handle delete action via POST
    if (action === "delete" && deal_id) {
      await supabase
        .from("deals")
        .delete()
        .eq("id", deal_id)
        .eq("account_id", accountId);

      return NextResponse.json({ success: true, deleted: true }, { headers: corsHeaders() });
    }

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
      let finalContactId = contact_id;

      // Auto-resolve or create contact if not provided
      if (!finalContactId) {
        const phone = rawPhone ? cleanPhone(rawPhone) : "";
        const contactName = (rawName || "").trim() || (phone ? `WhatsApp Contact (${phone.slice(-4)})` : "WhatsApp Contact");

        if (phone && phone.length >= 7) {
          const { data: existingContacts } = await supabase
            .from("contacts")
            .select("id")
            .eq("account_id", accountId)
            .or(`phone.eq.${phone},phone.ilike.%${phone.slice(-10)}%`)
            .limit(1);
          if (existingContacts && existingContacts.length > 0) {
            finalContactId = existingContacts[0].id;
          }
        }

        if (!finalContactId && rawName) {
          const { data: nameContacts } = await supabase
            .from("contacts")
            .select("id")
            .eq("account_id", accountId)
            .ilike("name", `%${rawName}%`)
            .limit(1);
          if (nameContacts && nameContacts.length > 0) {
            finalContactId = nameContacts[0].id;
          }
        }

        // Create new contact row
        if (!finalContactId) {
          const { data: newContact, error: createContactErr } = await supabase
            .from("contacts")
            .insert({
              account_id: accountId,
              phone: phone || `wa_${Date.now()}`,
              name: contactName,
            })
            .select("id")
            .single();

          if (newContact) {
            finalContactId = newContact.id;
          } else {
            console.error("Auto contact creation error:", createContactErr);
          }
        }
      }

      if (!finalContactId) {
        return NextResponse.json({ error: "Could not associate lead with a valid contact." }, { status: 400, headers: corsHeaders() });
      }

      // Fetch default pipeline for account
      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const pipelineId = pipeline?.id;
      if (!pipelineId) {
        return NextResponse.json({ error: "No pipeline found in workspace" }, { status: 400, headers: corsHeaders() });
      }

      let finalStageId = stage_id;
      if (!finalStageId) {
        const { data: firstStage } = await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", pipelineId)
          .order("position", { ascending: true })
          .limit(1)
          .single();
        finalStageId = firstStage?.id;
      }

      // Create new deal / offer
      const { data: newDeal, error: createErr } = await supabase
        .from("deals")
        .insert({
          account_id: accountId,
          user_id: finalUserId,
          pipeline_id: pipelineId,
          contact_id: finalContactId,
          title: title ? title.trim() : "New Offer / Lead",
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
      // Update existing deal / offer
      const updatePayload: Record<string, any> = {};
      if (stage_id) updatePayload.stage_id = stage_id;
      if (title) updatePayload.title = title.trim();
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
