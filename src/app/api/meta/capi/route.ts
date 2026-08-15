import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { sendMetaConversionEvent } from "@/lib/meta/conversions-api";

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 100);

    const { data, error } = await supabase
      .from("facebook_conversion_events")
      .select("*, contact:contacts(name, phone)")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole("agent");

    const body = await request.json().catch(() => ({}));
    const {
      contact_id,
      deal_id,
      event_name = "Purchase",
      custom_event_name,
      value,
      currency,
      content_name,
      test_event_code_override,
    } = body;

    // Load Meta CAPI config
    const { data: config } = await supabaseAdmin()
      .from("facebook_ads_config")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();

    if (!config || !config.pixel_id || !config.access_token) {
      return NextResponse.json(
        { error: "Facebook Ads CAPI is not configured. Add your Pixel ID and Access Token in Settings." },
        { status: 400 },
      );
    }

    // Load Contact info if provided
    let contact: { name?: string | null; phone?: string | null; email?: string | null } | null = null;
    if (contact_id) {
      const { data: contactRow } = await supabaseAdmin()
        .from("contacts")
        .select("name, phone, email")
        .eq("id", contact_id)
        .eq("account_id", accountId)
        .maybeSingle();
      contact = contactRow;
    }

    // Split name into first and last
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (contact?.name) {
      const parts = contact.name.trim().split(/\s+/);
      firstName = parts[0] || null;
      if (parts.length > 1) {
        lastName = parts.slice(1).join(" ");
      }
    }

    const testCode = test_event_code_override || config.test_event_code;
    const finalCurrency = currency || config.currency || "USD";
    const numValue = typeof value === "number" ? value : (value ? parseFloat(value) : undefined);

    const result = await sendMetaConversionEvent({
      pixelId: config.pixel_id,
      accessToken: config.access_token,
      testEventCode: testCode,
      eventName: event_name as any,
      customEventName: custom_event_name,
      phone: contact?.phone || body.phone,
      email: contact?.email || body.email,
      firstName,
      lastName,
      value: numValue,
      currency: finalCurrency,
      contentName: content_name,
    });

    const status = result.success ? (testCode ? "test_sent" : "sent") : "failed";

    // Save event to audit log table
    const { data: loggedEvent } = await supabaseAdmin()
      .from("facebook_conversion_events")
      .insert({
        account_id: accountId,
        contact_id: contact_id || null,
        deal_id: deal_id || null,
        event_name: event_name === "Custom" && custom_event_name ? custom_event_name : event_name,
        value: numValue || null,
        currency: finalCurrency,
        meta_event_id: result.fbtraceId || null,
        status,
        error_message: result.error || null,
      })
      .select()
      .single();

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to deliver event to Meta CAPI" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      event: loggedEvent,
      events_received: result.eventsReceived,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
