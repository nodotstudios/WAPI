import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";

export async function GET(request: Request) {
  try {
    const { userId, accountId } = await requireRole("agent");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${new URL(request.url).origin}/api/integrations/google/callback`;

    if (!clientId) {
      return NextResponse.json(
        { error: "Google OAuth credentials (GOOGLE_CLIENT_ID) are not configured." },
        { status: 400 }
      );
    }

    const state = Buffer.from(JSON.stringify({ userId, accountId })).toString("base64url");

    const scopes = [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" ");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return NextResponse.json({ url: authUrl.toString() });
  } catch (err) {
    return toErrorResponse(err);
  }
}
