import { createClient } from "@/lib/supabase/client";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import type { CrmActivity, CrmActivityType, CrmActivityStatus } from "@/types";

export interface CreateActivityInput {
  accountId?: string;
  userId: string;
  dealId?: string | null;
  contactId?: string | null;
  type: CrmActivityType;
  title: string;
  description?: string | null;
  scheduledAt?: string | null;
  durationMinutes?: number;
  status?: CrmActivityStatus;
  callOutcome?: string | null;
  callNotes?: string | null;
  googleCalendarEventId?: string | null;
  googleMeetUrl?: string | null;
  nextFollowUpAt?: string | null;
}

/**
 * Creates a unified CRM activity record and optionally updates deal's next_follow_up_at
 */
export async function createCrmActivity(input: CreateActivityInput): Promise<CrmActivity | null> {
  const admin = supabaseAdmin();

  const payload: Record<string, any> = {
    user_id: input.userId,
    account_id: input.accountId || undefined,
    deal_id: input.dealId || null,
    contact_id: input.contactId || null,
    type: input.type,
    title: input.title,
    description: input.description || null,
    scheduled_at: input.scheduledAt || null,
    duration_minutes: input.durationMinutes ?? 15,
    status: input.status || "pending",
    call_outcome: input.callOutcome || null,
    call_notes: input.callNotes || null,
    google_calendar_event_id: input.googleCalendarEventId || null,
    google_meet_url: input.googleMeetUrl || null,
    completed_at: input.status === "completed" ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("crm_activities")
    .insert(payload)
    .select("*, contact:contacts(*), deal:deals(*)")
    .single();

  if (error) {
    console.error("Failed to create CRM activity:", error);
    throw new Error(error.message);
  }

  // If next follow-up is specified and dealId exists, update the deal
  if (input.dealId) {
    const dealUpdates: Record<string, any> = {
      last_activity_at: new Date().toISOString(),
    };
    if (input.nextFollowUpAt) {
      dealUpdates.next_follow_up_at = input.nextFollowUpAt;
    }
    await admin.from("deals").update(dealUpdates).eq("id", input.dealId);
  }

  return data as CrmActivity;
}

/**
 * Logs a stage transition in deal_stage_history and creates an activity timeline item
 */
export async function logStageTransition(
  accountId: string,
  userId: string,
  dealId: string,
  fromStageId: string | null,
  toStageId: string,
  toStageName: string
) {
  const admin = supabaseAdmin();

  // 1. Record stage history
  await admin.from("deal_stage_history").insert({
    account_id: accountId,
    deal_id: dealId,
    from_stage_id: fromStageId || null,
    to_stage_id: toStageId,
    user_id: userId,
    created_at: new Date().toISOString(),
  });

  // 2. Record stage change activity in timeline
  await admin.from("crm_activities").insert({
    account_id: accountId,
    user_id: userId,
    deal_id: dealId,
    type: "stage_change",
    title: `Moved to "${toStageName}" stage`,
    status: "completed",
    completed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  // 3. Update deal's last_activity_at
  await admin.from("deals").update({
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", dealId);
}
