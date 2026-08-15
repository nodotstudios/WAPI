-- Migration 042: Quick Reply Attachments & Media Support
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS filename TEXT;

-- Update kind check constraint to allow media
ALTER TABLE quick_replies
  DROP CONSTRAINT IF EXISTS quick_replies_kind_check;

ALTER TABLE quick_replies
  ADD CONSTRAINT quick_replies_kind_check CHECK (kind IN ('text', 'media', 'interactive'));

-- Clean up any legacy dummy interactive quick replies
DELETE FROM quick_replies WHERE kind = 'interactive';
