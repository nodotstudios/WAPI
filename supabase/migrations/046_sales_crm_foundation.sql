-- Migration 046: Full-Fledged Sales CRM Foundation
-- Adds deal lifecycle fields, stage history, unified CRM activities, and Google Calendar integration tables.

-- ============================================================
-- 1. EXTEND DEALS TABLE
-- ============================================================
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS won_reason TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS lost_notes TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_next_follow_up ON deals(next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_deals_won_at ON deals(won_at);
CREATE INDEX IF NOT EXISTS idx_deals_lost_at ON deals(lost_at);

-- ============================================================
-- 2. DEAL STAGE HISTORY (For Conversion Velocity & Funnel Time)
-- ============================================================
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_account ON deal_stage_history(account_id);

ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own account deal stage history" ON deal_stage_history;
CREATE POLICY "Users can view own account deal stage history" ON deal_stage_history FOR ALL
  USING (
    account_id IS NULL OR EXISTS (
      SELECT 1 FROM accounts WHERE accounts.id = deal_stage_history.account_id
    )
  );

-- ============================================================
-- 3. UNIFIED CRM ACTIVITIES (Calls, Meetings, Google Meets, Notes, Tasks)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('call', 'meeting', 'google_meet', 'email', 'note', 'follow_up', 'task', 'stage_change')),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INT DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'rescheduled', 'overdue')),
  call_outcome TEXT,
  call_notes TEXT,
  google_calendar_event_id TEXT,
  google_meet_url TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_account ON crm_activities(account_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_deal ON crm_activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON crm_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_scheduled ON crm_activities(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_crm_activities_status ON crm_activities(status);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(type);

ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own account crm activities" ON crm_activities;
CREATE POLICY "Users can view own account crm activities" ON crm_activities FOR ALL
  USING (
    account_id IS NULL OR EXISTS (
      SELECT 1 FROM accounts WHERE accounts.id = crm_activities.account_id
    )
  );

-- ============================================================
-- 4. GOOGLE CALENDAR & MEET INTEGRATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS google_calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ,
  calendar_id TEXT DEFAULT 'primary',
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_account ON google_calendar_integrations(account_id);

ALTER TABLE google_calendar_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own google calendar integration" ON google_calendar_integrations;
CREATE POLICY "Users can manage own google calendar integration" ON google_calendar_integrations FOR ALL
  USING (auth.uid() = user_id);
