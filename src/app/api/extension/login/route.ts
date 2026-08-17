import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Client for authenticating credentials
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authErr } =
      await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

    if (authErr || !authData.user || !authData.session) {
      return NextResponse.json(
        { error: authErr?.message || "Invalid email or password" },
        { status: 401, headers: corsHeaders() }
      );
    }

    const userId = authData.user.id;

    // Fetch profile and account info using admin client
    const { data: profile } = await supabaseAdmin()
      .from("profiles")
      .select("*, accounts:account_id(*)")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile || !profile.account_id) {
      return NextResponse.json(
        { error: "No WAPI CRM account linked to this user." },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Update online presence
    void supabaseAdmin()
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("user_id", userId);

    return NextResponse.json(
      {
        success: true,
        token: authData.session.access_token,
        user: {
          id: profile.user_id,
          email: authData.user.email,
          name: profile.full_name || profile.name || authData.user.email,
          role: profile.account_role || profile.role || "member",
          accountId: profile.account_id,
          accountName: profile.accounts?.name || "My Workspace",
        },
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error("Extension Login API Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
