-- Migration 047: Deal Offerings & Templates System

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS description TEXT;

CREATE TABLE IF NOT EXISTS deal_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  value NUMERIC(12, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_offerings_account ON deal_offerings(account_id);
CREATE INDEX IF NOT EXISTS idx_deal_offerings_active ON deal_offerings(is_active);

ALTER TABLE deal_offerings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage account deal offerings" ON deal_offerings;
CREATE POLICY "Users can manage account deal offerings" ON deal_offerings FOR ALL
  USING (
    account_id IS NULL OR EXISTS (
      SELECT 1 FROM accounts WHERE accounts.id = deal_offerings.account_id
    )
  );
