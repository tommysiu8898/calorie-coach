// GET  /api/health-flags?user_id=xxx  — returns stored health flags
// POST /api/health-flags              — merges validated flag updates into the user's profile

import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX =
  /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

const ALLOWED_BOOLEAN_KEYS = new Set([
  "hypertension",
  "high_cholesterol",
  "diabetes",
  "pregnant",
  "supplement_allergies",
]);

/** Accept only known flag keys with appropriate value types. */
function sanitizeFlags(
  raw: Record<string, unknown>,
): Record<string, boolean | string> {
  const out: Record<string, boolean | string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (ALLOWED_BOOLEAN_KEYS.has(key)) {
      if (typeof value === "boolean") out[key] = value;
    } else if (key === "medications") {
      if (typeof value === "string" || typeof value === "boolean")
        out[key] = value as string | boolean;
    }
  }
  return out;
}

router.get("/health-flags", async (req, res) => {
  const user_id = req.query.user_id as string | undefined;
  if (!user_id || !USER_ID_REGEX.test(user_id)) {
    return res.status(400).json({ success: false, error: "Invalid user_id" });
  }
  try {
    const rows = await db
      .select({ healthFlags: profilesTable.healthFlags })
      .from(profilesTable)
      .where(eq(profilesTable.userId, user_id))
      .limit(1);
    return res.json({ success: true, flags: rows[0]?.healthFlags ?? {} });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.delete("/health-flags", async (req, res) => {
  const { user_id } = req.body as { user_id?: string };
  if (!user_id || !USER_ID_REGEX.test(user_id)) {
    return res.status(400).json({ success: false, error: "Invalid user_id" });
  }
  try {
    const result = await db
      .update(profilesTable)
      .set({
        healthFlags: sql`'{}'::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(profilesTable.userId, user_id))
      .returning({ userId: profilesTable.userId });
    if (result.length === 0) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post("/health-flags", async (req, res) => {
  const { user_id, flags } = req.body as {
    user_id?: string;
    flags?: Record<string, unknown>;
  };
  if (!user_id || !USER_ID_REGEX.test(user_id)) {
    return res.status(400).json({ success: false, error: "Invalid user_id" });
  }
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) {
    return res.status(400).json({ success: false, error: "flags must be an object" });
  }
  const sanitized = sanitizeFlags(flags);
  if (Object.keys(sanitized).length === 0) {
    return res.status(400).json({ success: false, error: "No valid flag keys provided" });
  }
  try {
    const result = await db
      .update(profilesTable)
      .set({
        healthFlags: sql`COALESCE(${profilesTable.healthFlags}, '{}') || ${JSON.stringify(sanitized)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(profilesTable.userId, user_id))
      .returning({ userId: profilesTable.userId });
    if (result.length === 0) {
      return res.status(404).json({ success: false, error: "Profile not found — complete onboarding first" });
    }
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
