// ── track.tsx PATCH ──────────────────────────────────────────────────────────
// Apply these TWO changes to:
//   Calorie-coach-main/artifacts/calorie-tracker/app/(tabs)/track.tsx
//
// CHANGE 1 ── Add imports (after the existing import block, ~line 30)
// ─────────────────────────────────────────────────────────────────────────────
// ADD these two lines right after the last existing import:
//
//   import { analyzeFood } from "@/lib/kimi-direct";
//   import { saveLocalMeal } from "@/lib/local-meals";
//
//
// CHANGE 2 ── Replace processImage() fetch call (~line 143)
// ─────────────────────────────────────────────────────────────────────────────
// FIND this block inside processImage():
/*
      const analysisRes = await fetch(`https://${domain}/api/analyze-food`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: compressed.base64, userId, languageCode }),
      });

      const analysisText = await analysisRes.text();
      if (!analysisRes.ok) {
        let errMsg = t("analysis_failed_default");
        try {
          const err = JSON.parse(analysisText) as { error?: string };
          if (err.error) errMsg = err.error;
        } catch { /* non-JSON body * / }
        throw new Error(errMsg);
      }

      let analysis: Omit<AnalysisResult, "capturedImageUri" | "photoUrl">;
      try {
        analysis = JSON.parse(analysisText);
      } catch {
        throw new Error(t("unexpected_response"));
      }
      const photoUrl = thumbnailDataUrl;
      const fullResult: AnalysisResult = { ...analysis, photoUrl, capturedImageUri: imageUri };
*/
// REPLACE WITH:
/*
      const analysis = await analyzeFood(compressed.base64, languageCode);
      const photoUrl = thumbnailDataUrl;
      const fullResult: AnalysisResult = { ...analysis, photoUrl, capturedImageUri: imageUri };
*/
//
//
// CHANGE 3 ── Replace saveMeal() fetch call (~line 262)
// ─────────────────────────────────────────────────────────────────────────────
// FIND this block inside saveMeal():
/*
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          photoUrl: result.photoUrl,
          aiResponse: { ... },
          userCorrections: hasCorrections ? editingIngredients : null,
          totalCalories: Math.round(totalCalories),
          totalProteinG,
          totalCarbsG,
          totalFatG,
          mealName: result.mealName,
          localHour: new Date().getHours(),
          localDate: new Date().toLocaleDateString("sv"),
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        cancelTodayStreakNudge().catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["today"] });
        setState("camera");
        setResult(null);
        setEditingIngredients([]);
        setPortionPct(100);
        setPortionText("100");
        router.replace("/(tabs)");
      } else {
        throw new Error("Save failed");
      }
*/
// REPLACE WITH:
/*
      await saveLocalMeal({
        userId: userId ?? "anonymous",
        photoUrl: result.photoUrl,
        mealName: result.mealName,
        mealType: getMealType(),
        totalCalories: Math.round(totalCalories),
        totalProteinG,
        totalCarbsG,
        totalFatG,
        localDate: new Date().toLocaleDateString("sv"),
        ingredients: hasCorrections ? editingIngredients : result.ingredients,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      cancelTodayStreakNudge().catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["today"] });
      setState("camera");
      setResult(null);
      setEditingIngredients([]);
      setPortionPct(100);
      setPortionText("100");
      router.replace("/(tabs)");
*/
