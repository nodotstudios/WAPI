-- Migration 045: Facebook Ads Config Stage Mapping

ALTER TABLE facebook_ads_config
  ADD COLUMN IF NOT EXISTS auto_send_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;
