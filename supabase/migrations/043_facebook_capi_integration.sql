-- Migration 043: Facebook Ads Attribution & Meta Conversions API (CAPI)

-- 1. Facebook Ads CAPI Configuration Table
CREATE TABLE IF NOT EXISTS facebook_ads_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
  pixel_id TEXT,
  access_token TEXT,
  test_event_code TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  auto_send_on_deal_won BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facebook_ads_config_account ON facebook_ads_config(account_id);

ALTER TABLE facebook_ads_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facebook_ads_config_select ON facebook_ads_config;
DROP POLICY IF EXISTS facebook_ads_config_insert ON facebook_ads_config;
DROP POLICY IF EXISTS facebook_ads_config_update ON facebook_ads_config;
DROP POLICY IF EXISTS facebook_ads_config_delete ON facebook_ads_config;

CREATE POLICY facebook_ads_config_select ON facebook_ads_config FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY facebook_ads_config_insert ON facebook_ads_config FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY facebook_ads_config_update ON facebook_ads_config FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

CREATE POLICY facebook_ads_config_delete ON facebook_ads_config FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- 2. Add Ad Attribution Columns to Contacts Table
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS ad_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_title TEXT,
  ADD COLUMN IF NOT EXISTS ad_thumbnail_url TEXT;

-- 3. Facebook Conversion Events Log Table
CREATE TABLE IF NOT EXISTS facebook_conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'USD',
  meta_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'test_sent')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facebook_conversion_events_account ON facebook_conversion_events(account_id);
CREATE INDEX IF NOT EXISTS idx_facebook_conversion_events_contact ON facebook_conversion_events(contact_id);

ALTER TABLE facebook_conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facebook_conversion_events_select ON facebook_conversion_events;
DROP POLICY IF EXISTS facebook_conversion_events_insert ON facebook_conversion_events;

CREATE POLICY facebook_conversion_events_select ON facebook_conversion_events FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY facebook_conversion_events_insert ON facebook_conversion_events FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
