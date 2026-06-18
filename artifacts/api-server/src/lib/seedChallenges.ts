import { randomUUID } from "crypto";
import { db, communityChallengesTable } from "@workspace/db";

export async function seedChallenges() {
  try {
    const existing = await db.select().from(communityChallengesTable).limit(1);
    if (existing.length > 0) return;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const startStr = weekStart.toISOString().split("T")[0];
    const endStr = weekEnd.toISOString().split("T")[0];

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthStartStr = monthStart.toISOString().split("T")[0];
    const monthEndStr = monthEnd.toISOString().split("T")[0];

    await db.insert(communityChallengesTable).values([
      {
        id: randomUUID(),
        title: "7-Day Streak Challenge",
        titleZhTw: "7天連續挑戰",
        titleZhCn: "7天连续挑战",
        description: "Log your meals every day for 7 consecutive days. Consistency is the key to results!",
        descriptionZhTw: "連續7天記錄每日餐點，堅持是成功的關鍵！",
        descriptionZhCn: "连续7天记录每日餐食，坚持是成功的关键！",
        emoji: "🔥",
        goalType: "streak_days",
        goalValue: 7,
        startDate: startStr,
        endDate: endStr,
        participantCount: 0,
        isActive: true,
      },
      {
        id: randomUUID(),
        title: "Protein Power Month",
        titleZhTw: "蛋白質強化月",
        titleZhCn: "蛋白质强化月",
        description: "Hit your daily protein target on 20 out of 30 days this month. Build that muscle!",
        descriptionZhTw: "本月30天中有20天達到每日蛋白質目標，打造強健肌肉！",
        descriptionZhCn: "本月30天中有20天达到每日蛋白质目标，打造强健肌肉！",
        emoji: "💪",
        goalType: "protein_days",
        goalValue: 20,
        startDate: monthStartStr,
        endDate: monthEndStr,
        participantCount: 0,
        isActive: true,
      },
      {
        id: randomUUID(),
        title: "Calorie Balance Week",
        titleZhTw: "卡路里平衡週",
        titleZhCn: "卡路里平衡周",
        description: "Stay within 10% of your calorie target for 5 days this week. Precision counts!",
        descriptionZhTw: "本週有5天將卡路里控制在目標的10%以內，精準飲食！",
        descriptionZhCn: "本周有5天将卡路里控制在目标的10%以内，精准饮食！",
        emoji: "⚖️",
        goalType: "calorie_balance_days",
        goalValue: 5,
        startDate: startStr,
        endDate: endStr,
        participantCount: 0,
        isActive: true,
      },
    ]);
    console.log("[seed] Seeded 3 sample challenges");
  } catch (err) {
    console.warn("[seed] Challenge seed failed (may already exist):", err);
  }
}
