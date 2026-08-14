-- ============================================================
-- 041: Add QR Gateway (WhatsApp Web / Evolution API / Baileys) Support
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_mode TEXT DEFAULT 'meta_cloud' CHECK (connection_mode IN ('meta_cloud', 'qr_gateway')),
  ADD COLUMN IF NOT EXISTS gateway_url TEXT,
  ADD COLUMN IF NOT EXISTS gateway_api_key TEXT,
  ADD COLUMN IF NOT EXISTS instance_name TEXT,
  ADD COLUMN IF NOT EXISTS qr_code_base64 TEXT;
