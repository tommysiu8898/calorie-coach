#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Idempotent migration: weight goal plan columns (added in task #191)
psql "$DATABASE_URL" -c "
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_start_date text;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_start_weight_kg real;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_duration_weeks integer;
"
