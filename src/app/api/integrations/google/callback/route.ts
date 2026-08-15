import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const stateRaw = searchParams.get("state");
    const error = searchParams.get("error");

    if (error || !code || !stateRaw) {
      return NextResponse.redirect(new URL("/settings?tab=google-calendar&error=oauth_failed", request.url));
    }

    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
    const { userId, accountId } = state;

    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${new URL(request.url).origin}/api/integrations/google/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/settings?tab=google-calendar&error=token_exchange_failed", request.url));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    const expiryDate = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Fetch user info for email
    let userEmail = null;
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        userEmail = userData.email || null;
      }
    } catch {}

    // Store in database
    await supabaseAdmin()
      .from("google_calendar_integrations")
      .upsert(
        {
          account_id: accountId,
          user_id: userId,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expiry: expiryDate,
          calendar_id: "primary",
          email: userEmail,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id, user_id" }
      );

    return NextResponse.redirect(new URL("/settings?tab=google-calendar&status=connected", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(new URL("/settings?tab=google-calendar&error=server_error", request.url));
  }
}
