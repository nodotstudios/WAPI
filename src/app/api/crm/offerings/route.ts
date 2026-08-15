import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function GET() {
  try {
    const { accountId } = await getCurrentAccount();

    const { data, error } = await supabaseAdmin()
      .from("deal_offerings")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ offerings: data || [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId, accountId } = await requireRole("agent");
    const body = await request.json().catch(() => ({}));

    const { title, description, value, currency, category } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Offering title is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin()
      .from("deal_offerings")
      .insert({
        account_id: accountId,
        user_id: userId,
        title: title.trim(),
        description: description?.trim() || null,
        value: parseFloat(value) || 0,
        currency: currency || "USD",
        category: category?.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to create offering" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, offering: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
