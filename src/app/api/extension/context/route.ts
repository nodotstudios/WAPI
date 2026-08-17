import { NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { supabaseAdmin } from "@/lib/flows/admin-client";

function cleanPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

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

export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const rawPhone = url.searchParams.get("phone") || "";
    const rawName = url.searchParams.get("name") || "";
    const phone = cleanPhone(rawPhone);
    const contactName = rawName.trim() || (phone ? `WhatsApp Contact (${phone.slice(-4)})` : "WhatsApp Contact");

    // Fetch active pipeline stages for account
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("account_id", accountId)
      .order("position", { ascending: true });

    // If no phone or name was specified (e.g. extension loaded without active chat)
    if (!phone && !rawName) {
      return NextResponse.json({
        success: true,
        account_id: accountId,
        contact: null,
        deal: null,
        stages: stages || [],
        activities: [],
      }, { headers: corsHeaders() });
    }

    // Find contact by phone or name
    let contact = null;
    if (phone && phone.length >= 7) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("*, tags:contact_tags(tags(*))")
        .eq("account_id", accountId)
        .or(`phone.eq.${phone},phone.ilike.%${phone.slice(-10)}%`)
        .limit(1);
      if (contacts && contacts.length > 0) contact = contacts[0];
    }

    if (!contact && rawName) {
      const { data: nameContacts } = await supabase
        .from("contacts")
        .select("*, tags:contact_tags(tags(*))")
        .eq("account_id", accountId)
        .ilike("name", `%${rawName}%`)
        .limit(1);
      if (nameContacts && nameContacts.length > 0) contact = nameContacts[0];
    }

    // Auto-create contact if not found yet
    if (!contact) {
      const { data: newContact, error: createErr } = await supabase
        .from("contacts")
        .insert({
          account_id: accountId,
          phone: phone || rawName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || `wa_${Date.now()}`,
          name: contactName,
        })
        .select()
        .single();

      if (!createErr && newContact) {
        contact = newContact;
      }
    }

    // Fetch active deal for contact
    let deal = null;
    if (contact) {
      const { data: deals } = await supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("account_id", accountId)
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (deals && deals.length > 0) {
        deal = deals[0];
      }
    }

    // Fetch recent activities & notes
    let activities = [];
    if (deal) {
      const { data: acts } = await supabase
        .from("crm_activities")
        .select("*")
        .eq("account_id", accountId)
        .eq("deal_id", deal.id)
        .order("created_at", { ascending: false })
        .limit(15);
      activities = acts || [];
    }

    return NextResponse.json({
      success: true,
      account_id: accountId,
      contact: contact,
      deal: deal,
      stages: stages || [],
      activities: activities,
    }, { headers: corsHeaders() });
  } catch (err) {
    console.error("Extension Context API Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
