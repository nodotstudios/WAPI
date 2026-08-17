import { NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { createCrmActivity } from "@/lib/crm/activities";
import { createGoogleCalendarEvent } from "@/lib/google/calendar";
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

    const { accountId, userId } = authCtx;
    const supabase = supabaseAdmin();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders() });
    }

    let { deal_id, contact_id, type, title, description, scheduled_at } = body;

    if (!title) {
      title = "Scheduled Follow-up";
    }

    // Normalize type to valid DB enum values ('call', 'meeting', 'google_meet', 'email', 'note', 'follow_up', 'task', 'stage_change')
    let normalizedType: "call" | "meeting" | "google_meet" | "email" | "note" | "follow_up" | "task" | "stage_change" = "follow_up";
    if (type === "call" || type === "call_followup") normalizedType = "call";
    else if (type === "meeting" || type === "meeting_followup") normalizedType = "meeting";
    else if (type === "note") normalizedType = "note";
    else if (type === "task") normalizedType = "task";

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

    if (!finalUserId) {
      return NextResponse.json(
        { error: "No user found to associate activity with" },
        { status: 400, headers: corsHeaders() }
      );
    }

    let googleCalendarEventId: string | null = null;
    let googleMeetUrl: string | null = null;

    // Trigger Google Calendar event creation if scheduled_at is provided
    if (scheduled_at) {
      try {
        const calRes = await createGoogleCalendarEvent({
          accountId,
          userId: finalUserId,
          title: title.trim(),
          description: description || undefined,
          startTime: scheduled_at,
          durationMinutes: 30,
          createMeetLink: normalizedType === "meeting",
        });

        if (calRes) {
          googleCalendarEventId = calRes.eventId;
          googleMeetUrl = calRes.meetUrl || calRes.eventUrl || null;
        }
      } catch (calErr) {
        // Google calendar not connected or error, continue gracefully
      }
    }

    // Insert CRM activity using standard createCrmActivity
    const activity = await createCrmActivity({
      accountId,
      userId: finalUserId,
      dealId: deal_id || null,
      contactId: contact_id || null,
      type: normalizedType,
      title: title.trim(),
      description: description || null,
      scheduledAt: scheduled_at ? new Date(scheduled_at).toISOString() : new Date().toISOString(),
      status: "pending",
      nextFollowUpAt: scheduled_at ? new Date(scheduled_at).toISOString() : undefined,
      googleCalendarEventId,
      googleMeetUrl,
    });

    return NextResponse.json({
      success: true,
      activity,
      googleMeetUrl,
    }, { headers: corsHeaders() });
  } catch (err) {
    console.error("Extension Activity API Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
