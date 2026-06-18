import { Router } from "express";
import { callKimi } from "./agent";

const router = Router();

// POST /exercise/estimate
// body: { description, weightKg?, appLanguage? }
// returns: { exerciseType, durationMinutes, caloriesBurned, met, confidence }
router.post("/exercise/estimate", async (req, res) => {
  try {
    const { description, weightKg, appLanguage } = req.body as {
      description?: string;
      weightKg?: number;
      appLanguage?: string;
    };

    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ success: false, error: "description is required" });
    }

    const weight = weightKg && Number.isFinite(Number(weightKg)) ? Number(weightKg) : 70;
    const langNote = appLanguage === "zh-TW"
      ? " Respond with exerciseType in Traditional Chinese."
      : appLanguage === "zh-CN"
      ? " Respond with exerciseType in Simplified Chinese."
      : "";

    const systemPrompt = `You are a fitness expert. Given a user's description of their workout, extract or estimate: the exercise type, duration in minutes, estimated calories burned, the MET value used, and your confidence (low/medium/high). The user weighs ${weight.toFixed(1)} kg. Calories = MET × weight_kg × (duration_hours).${langNote}

Return ONLY valid JSON with exactly these fields:
{
  "exerciseType": "string (exercise name)",
  "durationMinutes": number,
  "caloriesBurned": number (integer),
  "met": number,
  "confidence": "low" | "medium" | "high"
}
No markdown, no explanation, just the JSON object.`;

    const userPrompt = description.trim();

    const raw = await callKimi(systemPrompt, userPrompt, 256);

    let parsed: { exerciseType: string; durationMinutes: number; caloriesBurned: number; met: number; confidence: string };
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(422).json({ success: false, error: "Could not parse AI response" });
    }

    if (!parsed.exerciseType || !parsed.durationMinutes || !parsed.caloriesBurned) {
      return res.status(422).json({ success: false, error: "Incomplete AI response" });
    }

    return res.json({
      success: true,
      exerciseType: String(parsed.exerciseType),
      durationMinutes: Math.max(1, Math.round(Number(parsed.durationMinutes) || 30)),
      caloriesBurned: Math.max(1, Math.round(Number(parsed.caloriesBurned) || 0)),
      met: Number(parsed.met) || 5.0,
      confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "medium",
    });
  } catch (err) {
    console.error("[exercise/estimate]", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
