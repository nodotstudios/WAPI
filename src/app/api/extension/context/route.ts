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

    // 1. Fetch default pipeline and stages for account
    const { data: pipeline } = await supabase
      .from("pipelines")
      .select("id, name")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let stages: Array<{ id: string; name: string; color: string; position: number }> = [];
    if (pipeline?.id) {
      const { data: stagesData } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, position")
        .eq("pipeline_id", pipeline.id)
        .order("position", { ascending: true });
      stages = stagesData || [];
    }

    // If no contact specified (e.g. extension loaded without active chat)
    if (!phone && !rawName) {
      return NextResponse.json(
        {
          success: true,
          account_id: accountId,
          contact: null,
          deals: [],
          stages: stages,
          activities: [],
        },
        { headers: corsHeaders() }
      );
    }

    // 2. Lookup contact fast
    let contact = null;
    if (phone && phone.length >= 7) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, phone, email")
        .eq("account_id", accountId)
        .or(`phone.eq.${phone},phone.ilike.%${phone.slice(-10)}%`)
        .limit(1);
      if (contacts && contacts.length > 0) contact = contacts[0];
    }

    if (!contact && rawName) {
      const { data: nameContacts } = await supabase
        .from("contacts")
        .select("id, name, phone, email")
        .eq("account_id", accountId)
        .ilike("name", `%${rawName}%`)
        .limit(1);
      if (nameContacts && nameContacts.length > 0) contact = nameContacts[0];
    }

    // Auto-create contact if not found
    if (!contact) {
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          account_id: accountId,
          phone: phone || `wa_${Date.now()}`,
          name: contactName,
        })
        .select("id, name, phone, email")
        .single();
      if (newContact) contact = newContact;
    }

    // 3. Fetch ALL deals and activities for this contact in parallel
    let deals: any[] = [];
    let activities: any[] = [];

    if (contact) {
      const [dealsRes, activitiesRes] = await Promise.all([
        supabase
          .from("deals")
          .select("id, title, value, currency, status, stage_id, created_at, won_at, lost_at")
          .eq("account_id", accountId)
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("crm_activities")
          .select("id, type, title, description, scheduled_at, status, created_at, deal_id")
          .eq("account_id", accountId)
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      deals = dealsRes.data || [];
      activities = activitiesRes.data || [];
    }

    return NextResponse.json(
      {
        success: true,
        account_id: accountId,
        contact: contact,
        deals: deals,
        stages: stages,
        activities: activities,
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error("Extension Context API Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
