import crypto from "crypto";

export interface SendCAPIEventParams {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
  eventName: "Purchase" | "Lead" | "Contact" | "Subscribe" | "Custom";
  customEventName?: string;
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  value?: number | null;
  currency?: string | null;
  contentName?: string | null;
  eventId?: string;
  eventSourceUrl?: string;
}

export interface CAPIResponse {
  success: boolean;
  eventsReceived?: number;
  fbtraceId?: string;
  error?: string;
}

/**
 * Normalizes and hashes strings with SHA-256 according to Meta's CAPI specifications.
 */
export function hashData(val: string): string {
  return crypto.createHash("sha256").update(val.trim().toLowerCase()).digest("hex");
}

/**
 * Normalizes phone numbers for Meta (digits only, country code included, no leading + or zeros)
 */
export function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return crypto.createHash("sha256").update(digits).digest("hex");
}

export async function sendMetaConversionEvent(
  params: SendCAPIEventParams,
): Promise<CAPIResponse> {
  try {
    const {
      pixelId,
      accessToken,
      testEventCode,
      eventName,
      customEventName,
      phone,
      email,
      firstName,
      lastName,
      value,
      currency,
      contentName,
      eventId,
      eventSourceUrl,
    } = params;

    if (!pixelId || !accessToken) {
      return { success: false, error: "Missing Pixel ID or Meta Access Token" };
    }

    const userData: Record<string, unknown> = {};

    if (phone) {
      userData.ph = [hashPhone(phone)];
    }
    if (email) {
      userData.em = [hashData(email)];
    }
    if (firstName) {
      userData.fn = [hashData(firstName)];
    }
    if (lastName) {
      userData.ln = [hashData(lastName)];
    }

    const eventTime = Math.floor(Date.now() / 1000);
    const finalEventId = eventId || `wapi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const customData: Record<string, unknown> = {};
    if (typeof value === "number") {
      customData.value = value;
      customData.currency = currency || "USD";
    }
    if (contentName) {
      customData.content_name = contentName;
    }

    const eventPayload: Record<string, unknown> = {
      event_name: eventName === "Custom" && customEventName ? customEventName : eventName,
      event_time: eventTime,
      event_id: finalEventId,
      action_source: "chat",
      user_data: userData,
      custom_data: Object.keys(customData).length > 0 ? customData : undefined,
    };

    if (eventSourceUrl) {
      eventPayload.event_source_url = eventSourceUrl;
    }

    const bodyPayload: Record<string, unknown> = {
      data: [eventPayload],
    };

    if (testEventCode?.trim()) {
      bodyPayload.test_event_code = testEventCode.trim();
    }

    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data?.error?.message || `Meta Graph API returned HTTP ${res.status}`;
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      eventsReceived: data.events_received,
      fbtraceId: data.fbtrace_id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
