import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-context";
import { createClient } from "@/lib/supabase/server";

function cleanPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawPhone = url.searchParams.get("phone") || "";
    const phone = cleanPhone(rawPhone);

    if (!phone) {
      return NextResponse.json({ error: "phone parameter is required" }, { status: 400 });
    }

    // Authenticate via API key or session
    let accountId: string | null = null;
    let supabase = await createClient();

    try {
      const apiKeyCtx = await requireApiKey(request, "contacts:read");
      accountId = apiKeyCtx.accountId;
      supabase = apiKeyCtx.supabase;
    } catch {
      // Fallback to active Auth Session if logged in via web browser session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized. Please provide a valid API Key." }, { status: 401 });
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

    // Find contact by phone (ends_with or exact digits)
    const { data: contacts } = await supabase
      .from("contacts")
      .select("*, tags:contact_tags(tags(*))")
      .eq("account_id", accountId)
      .or(`phone.eq.${phone},phone.ilike.%${phone.slice(-10)}%`)
      .limit(1);

    let contact = contacts && contacts.length > 0 ? contacts[0] : null;

    // Auto-create contact if not found yet
    if (!contact) {
      const { data: newContact, error: createErr } = await supabase
        .from("contacts")
        .insert({
          account_id: accountId,
          phone: phone,
          name: `WhatsApp Contact (${phone.slice(-4)})`,
        })
        .select()
        .single();

      if (!createErr && newContact) {
        contact = newContact;
      }
    }

    // Fetch active pipeline stages for account
    const { data: defaultPipeline } = await supabase
      .from("pipelines")
      .select("id")
      .eq("account_id", accountId)
      .eq("is_default", true)
      .single();

    const pipelineId = defaultPipeline?.id;
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("account_id", accountId)
      .order("position", { ascending: true });

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
    });
  } catch (err) {
    console.error("Extension Context API Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
