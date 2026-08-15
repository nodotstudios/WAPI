import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const activityId = params.id;
    const { accountId } = await requireRole("agent");
    const body = await request.json().catch(() => ({}));

    const {
      status,
      call_outcome,
      call_notes,
      description,
      scheduled_at,
      completed_at,
      next_follow_up_at,
      deal_id,
    } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      updates.status = status;
      if (status === "completed" && !completed_at) {
        updates.completed_at = new Date().toISOString();
      }
    }
    if (call_outcome !== undefined) updates.call_outcome = call_outcome;
    if (call_notes !== undefined) updates.call_notes = call_notes;
    if (description !== undefined) updates.description = description;
    if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
    if (completed_at !== undefined) updates.completed_at = completed_at;

    const { data: updated, error } = await supabaseAdmin()
      .from("crm_activities")
      .update(updates)
      .eq("id", activityId)
      .eq("account_id", accountId)
      .select("*, user:profiles(*), contact:contacts(*), deal:deals(*)")
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: error?.message || "Activity not found" }, { status: 404 });
    }

    // Update deal next follow-up if provided
    if (deal_id || updated.deal_id) {
      const targetDealId = deal_id || updated.deal_id;
      const dealUpdates: Record<string, any> = {
        last_activity_at: new Date().toISOString(),
      };
      if (next_follow_up_at) {
        dealUpdates.next_follow_up_at = next_follow_up_at;
      }
      await supabaseAdmin().from("deals").update(dealUpdates).eq("id", targetDealId);
    }

    return NextResponse.json({ ok: true, activity: updated });
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
    const activityId = params.id;
    const { accountId } = await requireRole("agent");

    const { error } = await supabaseAdmin()
      .from("crm_activities")
      .delete()
      .eq("id", activityId)
      .eq("account_id", accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
