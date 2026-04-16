-- Add hasPitched column to Player table for season pitching tracker
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "hasPitched" BOOLEAN NOT NULL DEFAULT false;
