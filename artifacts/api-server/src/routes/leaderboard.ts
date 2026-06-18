import { Router } from "express";
import { db, userStatsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router = Router();

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getInitials(userId: string, displayName?: string | null): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }
  return userId.replace(/^user_/, "").slice(0, 2).toUpperCase();
}

router.get("/leaderboard", async (_req, res) => {
  try {
    const currentWeek = getISOWeek(new Date());

    const rows = await db
      .select({
        userId: userStatsTable.userId,
        vitalityScore: userStatsTable.vitalityScore,
        streakDays: userStatsTable.streakDays,
        isoWeek: userStatsTable.isoWeek,
        displayName: userStatsTable.displayName,
      })
      .from(userStatsTable)
      .where(eq(userStatsTable.isoWeek, currentWeek))
      .orderBy(desc(userStatsTable.vitalityScore))
      .limit(50);

    const leaderboard = rows.map((row, idx) => {
      const displayName = row.displayName ?? `User ${row.userId.replace(/^user_/, "").slice(0, 6)}`;
      return {
        rank: idx + 1,
        userId: row.userId,
        displayName,
        initials: getInitials(row.userId, row.displayName),
        vitalityScore: row.vitalityScore,
        streakDays: row.streakDays,
        isoWeek: row.isoWeek,
      };
    });

    return res.json({ leaderboard, week: currentWeek });
  } catch (err) {
    console.error("[leaderboard] error:", err);
    return res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

export default router;
