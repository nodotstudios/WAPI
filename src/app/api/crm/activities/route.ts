import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { createCrmActivity } from "@/lib/crm/activities";

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { searchParams } = new URL(request.url);

    const dealId = searchParams.get("deal_id");
    const contactId = searchParams.get("contact_id");
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const overdue = searchParams.get("overdue") === "true";
    const today = searchParams.get("today") === "true";
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10));

    let query = supabaseAdmin()
      .from("crm_activities")
      .select("*, user:profiles(*), contact:contacts(*), deal:deals(*)")
      .eq("account_id", accountId);

    if (dealId) query = query.eq("deal_id", dealId);
    if (contactId) query = query.eq("contact_id", contactId);
    if (type) query = query.eq("type", type);
    if (status) query = query.eq("status", status);

    const now = new Date();
    if (overdue) {
      query = query
        .eq("status", "pending")
        .lt("scheduled_at", now.toISOString());
    } else if (today) {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
      query = query
        .gte("scheduled_at", startOfDay)
        .lte("scheduled_at", endOfDay);
    }

    query = query.order("scheduled_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ activities: data || [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId, accountId } = await requireRole("agent");
    const body = await request.json().catch(() => ({}));

    const {
      deal_id,
      contact_id,
      type,
      title,
      description,
      scheduled_at,
      duration_minutes,
      status,
      call_outcome,
      call_notes,
      google_calendar_event_id,
      google_meet_url,
      next_follow_up_at,
    } = body;

    if (!type || !title) {
      return NextResponse.json({ error: "Type and title are required" }, { status: 400 });
    }

    const activity = await createCrmActivity({
      accountId,
      userId,
      dealId: deal_id,
      contactId: contact_id,
      type,
      title: title.trim(),
      description,
      scheduledAt: scheduled_at,
      durationMinutes: duration_minutes,
      status,
      callOutcome: call_outcome,
      callNotes: call_notes,
      googleCalendarEventId: google_calendar_event_id,
      googleMeetUrl: google_meet_url,
      nextFollowUpAt: next_follow_up_at,
    });

    if (!activity) {
      return NextResponse.json({ error: "Failed to create activity" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, activity });
  } catch (err) {
    return toErrorResponse(err);
  }
}
