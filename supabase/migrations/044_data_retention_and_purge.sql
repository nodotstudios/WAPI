-- Migration 044: Data Retention & Auto-Purge Settings

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS chat_retention_days INT NOT NULL DEFAULT 0;

-- Function to purge messages older than retention days for an account
CREATE OR REPLACE FUNCTION purge_expired_messages(p_account_id UUID, p_retention_days INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INT := 0;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  IF p_retention_days <= 0 THEN
    RETURN 0;
  END IF;

  v_cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;

  DELETE FROM messages
  WHERE conversation_id IN (SELECT id FROM conversations WHERE account_id = p_account_id)
    AND created_at < v_cutoff_date;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;
