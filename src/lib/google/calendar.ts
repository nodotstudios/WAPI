import { supabaseAdmin } from "@/lib/automations/admin-client";

export interface GoogleMeetingInput {
  accountId: string;
  userId: string;
  title: string;
  description?: string;
  startTime: string; // ISO string
  durationMinutes: number;
  attendees?: string[]; // email addresses
  createMeetLink?: boolean;
}

export interface GoogleMeetingResult {
  eventId: string;
  eventUrl?: string;
  meetUrl?: string;
  startTime: string;
  endTime: string;
}

/**
 * Refresh Google Access Token using Refresh Token
 */
export async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error("Google token refresh failed:", await res.text());
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 3600,
    };
  } catch (err) {
    console.error("Error refreshing Google token:", err);
    return null;
  }
}

/**
 * Creates an event on Google Calendar with optional Google Meet video conference
 */
export async function createGoogleCalendarEvent(
  input: GoogleMeetingInput
): Promise<GoogleMeetingResult | null> {
  const admin = supabaseAdmin();

  // 1. Get user's Google Calendar Integration
  const { data: integration } = await admin
    .from("google_calendar_integrations")
    .select("*")
    .eq("account_id", input.accountId)
    .eq("user_id", input.userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!integration || !integration.access_token) {
    return null;
  }

  let accessToken = integration.access_token;
  const isExpired = integration.token_expiry
    ? new Date(integration.token_expiry).getTime() <= Date.now() + 60000
    : false;

  // Refresh if needed
  if (isExpired && integration.refresh_token) {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    if (clientId && clientSecret) {
      const refreshed = await refreshGoogleToken(integration.refresh_token, clientId, clientSecret);
      if (refreshed) {
        accessToken = refreshed.accessToken;
        const newExpiry = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
        await admin
          .from("google_calendar_integrations")
          .update({ access_token: accessToken, token_expiry: newExpiry })
          .eq("id", integration.id);
      }
    }
  }

  const start = new Date(input.startTime);
  const end = new Date(start.getTime() + input.durationMinutes * 60000);

  const eventPayload: Record<string, any> = {
    summary: input.title,
    description: input.description || "",
    start: {
      dateTime: start.toISOString(),
    },
    end: {
      dateTime: end.toISOString(),
    },
  };

  if (input.attendees && input.attendees.length > 0) {
    eventPayload.attendees = input.attendees.map((email) => ({ email }));
  }

  if (input.createMeetLink) {
    eventPayload.conferenceData = {
      createRequest: {
        requestId: `wapi_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        conferenceSolutionKey: {
          type: "hangoutsMeet",
        },
      },
    };
  }

  try {
    const calendarId = encodeURIComponent(integration.calendar_id || "primary");
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventPayload),
    });

    if (!res.ok) {
      console.error("Failed to create Google Calendar event:", await res.text());
      return null;
    }

    const data = await res.json();
    const meetUrl =
      data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri ||
      data.hangoutLink ||
      null;

    return {
      eventId: data.id,
      eventUrl: data.htmlLink,
      meetUrl: meetUrl,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  } catch (err) {
    console.error("Error creating Google Calendar event:", err);
    return null;
  }
}
