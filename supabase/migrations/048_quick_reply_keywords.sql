-- Migration 048: Add keywords column to quick_replies table for smart auto-suggestions
ALTER TABLE public.quick_replies ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';
