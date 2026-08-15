import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const offeringId = params.id;
    const { accountId } = await requireRole("agent");
    const body = await request.json().catch(() => ({}));

    const { title, description, value, currency, category, is_active } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description ? description.trim() : null;
    if (value !== undefined) updates.value = parseFloat(value) || 0;
    if (currency !== undefined) updates.currency = currency;
    if (category !== undefined) updates.category = category ? category.trim() : null;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabaseAdmin()
      .from("deal_offerings")
      .update(updates)
      .eq("id", offeringId)
      .eq("account_id", accountId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Offering not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, offering: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const offeringId = params.id;
    const { accountId } = await requireRole("agent");

    const { error } = await supabaseAdmin()
      .from("deal_offerings")
      .delete()
      .eq("id", offeringId)
      .eq("account_id", accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
