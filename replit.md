# CalorieCam

AI-powered calorie tracking mobile app — scan food photos, log meals, track macros, and monitor body progress.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/calorie-tracker run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `KIMI_API_KEY`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`

## Stack

- **Monorepo**: pnpm workspaces, Node.js 24, TypeScript 5.9
- **Mobile**: Expo SDK 54, Expo Router v6, React Native
- **Auth**: Clerk (via `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`)
- **API**: Express 5, hosted at `artifacts/api-server`
- **DB**: PostgreSQL + Drizzle ORM
- **AI**: Kimi (vision + chat) via `KIMI_API_KEY`
- **i18n**: English, Traditional Chinese (zh-TW), Simplified Chinese (zh-CN) — all strings in `hooks/useI18n.ts`

## Where things live

```
artifacts/
  api-server/src/           — Express API routes, DB queries
  calorie-tracker/
    app/
      (tabs)/               — Tab screens (index, history, coach, health, profile, track)
      _layout.tsx           — Root stack (paywall modal registered here)
      paywall.tsx           — Subscription paywall modal
      onboarding.tsx        — First-run onboarding flow
      log-food.tsx          — Food search + manual entry
      meal-detail.tsx       — Per-meal breakdown
    components/             — Shared UI (MacroRing, CalorieBarChart, etc.)
    context/AppContext.tsx  — Global state (userId, isPremium, health flags)
    hooks/
      useI18n.ts            — All i18n strings for en / zh-TW / zh-CN
      useColors.ts          — Theme tokens (dark + light)
    db/schema.ts            — Drizzle schema (source of truth)
```

## Building for Device (EAS Development Build)

Expo Go cannot run HealthKit or device-level location permissions. To test these
features on a real iPhone you need a **development build** — a real `.ipa` compiled
with the native modules baked in.

### One-time setup
```bash
# Install EAS CLI globally (once per machine)
npm install -g eas-cli

# Log in to your Expo account
eas login

# Initialise the project on Expo's servers (links the Bundle ID)
cd artifacts/calorie-tracker
eas init
```

### Build using the helper script (recommended)

Always trigger EAS builds from the **workspace root** using the helper script —
it enforces the correct working directory (`artifacts/calorie-tracker`) automatically:

```bash
# Real device dev build (default: ios + development profile)
./scripts/eas-build.sh

# iOS Simulator — no Apple Developer account required
./scripts/eas-build.sh --platform ios --profile development-simulator

# Production build for App Store
./scripts/eas-build.sh --platform ios --profile production

# Android preview
./scripts/eas-build.sh --platform android --profile preview
```

### Build a development `.ipa` for a real iPhone (requires Apple Developer account)
```bash
# Real device — installs via direct link or TestFlight
# Required to test HealthKit and location permissions
./scripts/eas-build.sh --platform ios --profile development
```

### Build for iOS Simulator (no Apple Developer account required)
```bash
# Simulator only — HealthKit and location Settings entry will NOT work here
./scripts/eas-build.sh --platform ios --profile development-simulator
```

### Build a production `.ipa` for App Store
```bash
./scripts/eas-build.sh --platform ios --profile production
cd artifacts/calorie-tracker && eas submit --platform ios   # submits to App Store Connect
```

### EAS config files
- `artifacts/calorie-tracker/eas.json` — build profiles (`development`, `preview`, `production`)
- `artifacts/calorie-tracker/app.json` — Bundle ID `com.caloriescoach.app`, all native plugins

### After installing on device
- **Apple Health**: open the Health app → Sharing → Apps → you will see "Calories Coach"
- **Location**: iOS Settings → Privacy → Location Services → "Calories Coach" now appears

---

## User Preferences

- **RevenueCat**: User chose "skip for now — UI only". `isPremium` is hardcoded `false` in `AppContext.tsx`. Real RC integration is follow-up task #126.
- **No emojis** in UI copy unless explicitly in the design.
- **Accent color**: `#00c46a` (green). Dark bg: `#0a0f0d`. Fonts: Inter family.

---

## Feature Build Log (source of truth for what is DONE)

Use this section to avoid re-building completed features. Update it whenever a task is marked complete.

### ✅ Onboarding
- Multi-step flow: gender → age → height → weight → activity level → goal
- Calculates personalized TDEE + macro targets (protein/carbs/fat)
- Saves profile to DB via `PUT /api/profile`

### ✅ Authentication
- Clerk auth with Google + Apple sign-in
- "Continue without account" guest mode
- Session forwarded to API via Clerk proxy middleware

### ✅ Home Tab (`app/(tabs)/index.tsx`)
- Daily calorie ring (eaten vs. target)
- Macro mini-rings (protein, carbs, fat)
- Today's meal list (tap → meal detail)
- Week strip calendar — tap a past date to review that day
- NetCaloriesCard: Food Intake − Active Burned − Resting Burned
- Apple Health / HealthKit active + resting calorie sync
- Streak badge

### ✅ Progress Tab (was "History") (`app/(tabs)/history.tsx`)
- Renamed from "History" → **"Progress"** in tab bar (all 3 locales)
- **Top section — Nutrition History:**
  - 7-day / 30-day toggle
  - Streak card (current + best)
  - Calorie bar chart (tappable to filter meals by day)
  - Macro averages card
  - Infinite scroll meal list with swipe-to-delete
- **Bottom section — Body & Progress** (merged from hidden progress tab):
  - Stats row: streak · current weight · avg kcal/day
  - Badges card (🌱🔥⚡🏆💎 milestone badges)
  - Weight line chart + "Log Weight" button (kg/lbs toggle)
  - Avg daily calories table (3d / 7d / 14d / 30d / 90d / all time)
  - Weight changes table (same periods + distance to goal)
  - BMI card with color-coded BMI scale bar
  - Weekly Energy bar chart (This Week / Last Week toggle)

### ✅ AI Coach Tab (`app/(tabs)/coach.tsx`) — Premium gated
- Chat interface with Kimi AI
- Context-aware: knows user's profile, today's meals, macro targets
- Quick-chip prompts (analyze week, suggest meal, etc.)
- Streams responses

### ✅ Health Tab (`app/(tabs)/health.tsx`) — Premium gated
- Active Calories, Basal Calories, Total Burned, Sleep, Heart Rate stat cards
- Weekly health chart
- Reads from Apple Health / HealthKit

### ✅ Profile Tab (`app/(tabs)/profile.tsx`)
- Edit personal details (name, age, height, weight, goal)
- Daily calorie + macro targets
- Language selector (en / zh-TW / zh-CN)
- Notification / reminder settings
- Apple Health connection row (navigates to `apple-health.tsx`)
- Community profile setup

### ✅ Track / Scan (`app/(tabs)/track.tsx`) — hidden tab, opened via FAB
- Camera capture or photo picker
- Sends image to Kimi vision API
- Returns meal name + ingredients + calorie/macro estimates
- Confidence indicator
- Confirm & log flow

### ✅ Food Database (`app/log-food.tsx`)
- Search all foods (text query → API)
- "My Foods" tab (user-created custom foods)
- "My Meals" tab (saved meal templates)
- "Saved" tab (bookmarked foods)
- Manual food entry with macro breakdown
- Meal template creation & reuse

### ✅ Meal Detail (`app/meal-detail.tsx`)
- Ingredient-level breakdown
- Macro percentage donut
- Edit / delete entry

### ✅ Paywall Modal (`app/paywall.tsx`) — UI only, no real purchase
- Triggered when non-premium user taps History, Coach, or Health tab
- Feature bullets: AI Coach · Progress History · Health Sync · Body Progress
- Price card: $24.99/yr, 3-day free trial badge
- Subscribe button → "Coming soon" toast (RevenueCat not yet wired)
- Restore Purchases link
- Terms footer
- Full dark/light mode support
- i18n: en / zh-TW / zh-CN

### ✅ Subscription Gating (`app/(tabs)/_layout.tsx`)
- `isPremium: false` in `AppContext` (hardcoded until RC is wired)
- `gatePress()` blocks History, Coach, Health tabs → redirects to `/paywall`
- Coach center button also redirects to paywall when not premium

### ✅ i18n
- All UI strings in `hooks/useI18n.ts`
- 3 locales: `en`, `zh-TW`, `zh-CN`
- Language preference saved per-user

### ✅ Community (`app/group-chat.tsx`)
- Group messaging
- Leaderboard
- Vitality score

### ✅ Notifications
- Meal tracking reminders (configurable per day/time)
- Streak notifications

---

## Pending / Follow-up Tasks

| # | What | Status |
|---|------|--------|
| #125 | Health tab fixes (Apple Health in Profile, always-show stat cards, always-show NetCaloriesCard) | PENDING |
| #126 | Wire RevenueCat — real purchases for $24.99/yr plan | PROPOSED |
| #127 | Lock icon badge on gated tabs | PROPOSED |

---

## Gotchas

- The `progress.tsx` tab file still exists but its tab button is hidden (`tabBarButton: () => null`). All its content is now merged into `history.tsx`. Do not delete `progress.tsx` yet — it's a safe redirect fallback.
- `isPremium` in `AppContext` is `false` at compile time. Swapping it to `true` locally will unlock all tabs for testing without touching RevenueCat.
- Expo web preview redirects to login — always test features on a physical device or simulator with an active Clerk session.
- The API server occasionally fails to start due to `EADDRINUSE ::: 8080` — restart the workflow if that happens.
- Package version warnings (`expo-notifications`, `expo-image-manipulator`) are cosmetic — do not upgrade without checking Expo SDK 54 compatibility.
