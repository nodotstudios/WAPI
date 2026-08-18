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

    // Ensure we have a valid fallback user ID
    let finalUserId = userId;
    if (!finalUserId) {
      const { data: member } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("account_id", accountId)
        .limit(1)
        .maybeSingle();
      finalUserId = member?.user_id;
    }

    // 1. Fetch default pipeline, stages, offerings, quick replies, all active deals, and today's schedule in parallel
    const [pipelineRes, offeringsRes, quickRepliesRes, allDealsRes, todayActivitiesRes] = await Promise.all([
      supabase
        .from("pipelines")
        .select("id, name")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("deal_offerings")
        .select("id, title, description, value, currency")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .order("title", { ascending: true }),
      supabase
        .from("quick_replies")
        .select("id, title, kind, content_text, media_url, media_type, filename, keywords, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false }),
      supabase
        .from("deals")
        .select(`
          id,
          title,
          value,
          currency,
          status,
          stage_id,
          next_follow_up_at,
          contact:contacts(id, name, phone),
          stage:pipeline_stages(id, name, color, position)
        `)
        .eq("account_id", accountId)
        .eq("status", "open"),
      supabase
        .from("crm_activities")
        .select(`
          id,
          type,
          title,
          description,
          scheduled_at,
          status,
          deal_id,
          contact:contacts(id, name, phone)
        `)
        .eq("account_id", accountId)
        .neq("status", "completed")
        .order("scheduled_at", { ascending: true })
        .limit(50),
    ]);

    const pipeline = pipelineRes.data;
    const offerings = offeringsRes.data || [];
    const quickReplies = (quickRepliesRes.data || []).filter((qr: any) => qr.kind !== "interactive");
    const rawAllDeals = allDealsRes.data || [];
    const rawActivities = todayActivitiesRes.data || [];

    let stages: Array<{ id: string; name: string; color: string; position: number }> = [];
    if (pipeline?.id) {
      const { data: stagesData } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, position")
        .eq("pipeline_id", pipeline.id)
        .order("position", { ascending: true });
      stages = stagesData || [];
    }

    // Build fast lookup map for WhatsApp Web chat list badges and filters
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const allDealsMap: Record<string, any> = {};
    for (const d of rawAllDeals as any[]) {
      const contactObj = d.contact;
      const stageObj = d.stage;
      const cPhone = contactObj?.phone ? cleanPhone(contactObj.phone) : "";
      const cName = contactObj?.name?.trim().toLowerCase() || "";

      const followUpDate = d.next_follow_up_at ? new Date(d.next_follow_up_at) : null;
      const isDueToday = followUpDate ? followUpDate <= todayEnd : false;

      const badgeInfo = {
        deal_id: d.id,
        title: d.title,
        value: d.value || 0,
        currency: d.currency || "USD",
        stage_id: d.stage_id,
        stage_name: stageObj?.name || "Open",
        stage_color: stageObj?.color || "#10B981",
        stage_position: stageObj?.position ?? 0,
        next_follow_up_at: d.next_follow_up_at,
        is_due_today: isDueToday,
        contact_name: contactObj?.name || "",
        contact_phone: contactObj?.phone || "",
      };

      if (cPhone) {
        allDealsMap[cPhone] = badgeInfo;
        if (cPhone.length > 10) {
          allDealsMap[cPhone.slice(-10)] = badgeInfo;
        }
      }
      if (cName) {
        allDealsMap[cName] = badgeInfo;
      }
    }

    // Filter today's activities & follow-ups
    const todayActivities = (rawActivities as any[]).map((act) => {
      const schDate = act.scheduled_at ? new Date(act.scheduled_at) : null;
      const isDueToday = schDate ? schDate <= todayEnd : true;
      return {
        id: act.id,
        type: act.type,
        title: act.title,
        description: act.description,
        scheduled_at: act.scheduled_at,
        status: act.status,
        deal_id: act.deal_id,
        contact_name: act.contact?.name || "WhatsApp Contact",
        contact_phone: act.contact?.phone || "",
        is_due_today: isDueToday,
      };
    });

    // If no active contact in current view
    if (!phone && !rawName) {
      return NextResponse.json(
        {
          success: true,
          account_id: accountId,
          contact: null,
          deals: [],
          stages: stages,
          offerings: offerings,
          quick_replies: quickReplies,
          all_deals_map: allDealsMap,
          today_activities: todayActivities,
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
    if (!contact && (phone || rawName)) {
      const { data: newContact, error: createErr } = await supabase
        .from("contacts")
        .insert({
          account_id: accountId,
          user_id: finalUserId,
          name: contactName,
          phone: phone || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id, name, phone, email")
        .single();
      if (newContact) contact = newContact;
      else if (createErr) console.error("Context auto-contact create error:", createErr);
    }

    // 3. Fetch active deals and activities for this specific contact
    let deals: any[] = [];
    let activities: any[] = [];

    if (contact) {
      const [dealsRes, activitiesRes] = await Promise.all([
        supabase
          .from("deals")
          .select("id, title, value, currency, status, stage_id, created_at, won_at, lost_at")
          .eq("account_id", accountId)
          .eq("contact_id", contact.id)
          .eq("status", "open")
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
        offerings: offerings,
        quick_replies: quickReplies,
        all_deals_map: allDealsMap,
        today_activities: todayActivities,
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
