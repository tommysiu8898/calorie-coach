// ── coach.tsx PATCH ──────────────────────────────────────────────────────────
// Apply these changes to:
//   Calorie-coach-main/artifacts/calorie-tracker/app/(tabs)/coach.tsx
//
// CHANGE 1 ── Add imports (after the last existing import ~line 25)
// ─────────────────────────────────────────────────────────────────────────────
// ADD after the last existing import:
//
//   import { coachAnalyze, coachAdvise } from "@/lib/kimi-direct";
//   import { getLocalMealsLastNDays, loadLocalProfile } from "@/lib/local-meals";
//
//
// CHANGE 2 ── Replace handleAnalyze fetch call (~line 720)
// ─────────────────────────────────────────────────────────────────────────────
// FIND inside handleAnalyze():
/*
      const healthActivity = await getTodayHealthActivity();
      const res = await fetch(`${baseUrl}/api/agent/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          appLanguage: languageCodeRef.current,
          steps: healthActivity.isAuthorized ? healthActivity.steps : undefined,
          activeCalories: healthActivity.isAuthorized ? healthActivity.activeCalories : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { summary: string; deficiencies: string[]; recommendation_text: string };
      lastDeficienciesRef.current = data.deficiencies ?? [];
      appendMessage({
        id: genId(), role: "agent", type: "analysis",
        summary: data.summary,
        deficiencies: data.deficiencies,
        recommendation_text: data.recommendation_text,
        timestamp: new Date(),
      });
*/
// REPLACE WITH:
/*
      const healthActivity = await getTodayHealthActivity();
      const [recentMeals, profile] = await Promise.all([
        getLocalMealsLastNDays(userId ?? "anonymous", 7),
        loadLocalProfile(),
      ]);
      const data = await coachAnalyze({
        meals: recentMeals,
        profile,
        languageCode: languageCodeRef.current,
        steps: healthActivity.isAuthorized ? healthActivity.steps : undefined,
        activeCalories: healthActivity.isAuthorized ? healthActivity.activeCalories : undefined,
      });
      lastDeficienciesRef.current = data.deficiencies ?? [];
      appendMessage({
        id: genId(), role: "agent", type: "analysis",
        summary: data.summary,
        deficiencies: data.deficiencies,
        recommendation_text: data.recommendation_text,
        timestamp: new Date(),
      });
*/
//
//
// CHANGE 3 ── Replace handleSend fetch call (~line 755)
// ─────────────────────────────────────────────────────────────────────────────
// FIND inside handleSend():
/*
      const healthActivity = await getTodayHealthActivity();
      const res = await fetch(`${baseUrl}/api/agent/advise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          user_query: query,
          appLanguage: languageCodeRef.current,
          steps: healthActivity.isAuthorized ? healthActivity.steps : undefined,
          activeCalories: healthActivity.isAuthorized ? healthActivity.activeCalories : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { response: string };
      appendMessage({ id: genId(), role: "agent", type: "text", text: data.response, timestamp: new Date() });
*/
// REPLACE WITH:
/*
      const healthActivity = await getTodayHealthActivity();
      const [recentMeals, profile] = await Promise.all([
        getLocalMealsLastNDays(userId ?? "anonymous", 3),
        loadLocalProfile(),
      ]);
      const response = await coachAdvise({
        query,
        meals: recentMeals,
        profile,
        languageCode: languageCodeRef.current,
        steps: healthActivity.isAuthorized ? healthActivity.steps : undefined,
        activeCalories: healthActivity.isAuthorized ? healthActivity.activeCalories : undefined,
      });
      appendMessage({ id: genId(), role: "agent", type: "text", text: response, timestamp: new Date() });
*/
