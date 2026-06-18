// ── _layout.tsx PATCH ────────────────────────────────────────────────────────
// Apply this ONE change to:
//   Calorie-coach-main/artifacts/calorie-tracker/app/_layout.tsx
//
// ADD this as the very FIRST line of the file (before all other imports):
//
//   import "@/lib/local-api-interceptor";
//
// That's it. The interceptor patches global fetch() at startup so every
// /api/* call is handled locally — no backend server needed.
//
// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE — your _layout.tsx should start like this:
//
//   import "@/lib/local-api-interceptor";   // ← ADD THIS LINE FIRST
//   import { Stack } from "expo-router";
//   import { useEffect } from "react";
//   ...rest of your existing imports
