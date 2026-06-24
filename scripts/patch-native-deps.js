#!/usr/bin/env node
// Fixes react-native-health podspec for React Native 0.60+:
//   - s.dependency 'React' was removed; the pod is now 'React-Core'
//   - iOS deployment target bumped from 9.0 to 13.4 (Expo SDK 54 minimum)
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PNPM_STORE = path.join(ROOT, "node_modules", ".pnpm");

function patchPodspec(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  let changed = false;

  if (content.includes("s.dependency 'React'")) {
    content = content.replace(/s\.dependency 'React'/, "s.dependency 'React-Core'");
    changed = true;
  }
  if (content.includes("s.ios.deployment_target = '9.0'")) {
    content = content.replace(
      "s.ios.deployment_target = '9.0'",
      "s.ios.deployment_target = '13.4'"
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log("[patch-native-deps] Patched:", filePath);
  }
}

// Search under node_modules/.pnpm for react-native-health entries
if (fs.existsSync(PNPM_STORE)) {
  const entries = fs.readdirSync(PNPM_STORE);
  for (const entry of entries) {
    if (!entry.startsWith("react-native-health@")) continue;
    const podspec = path.join(
      PNPM_STORE,
      entry,
      "node_modules",
      "react-native-health",
      "RNAppleHealthKit.podspec"
    );
    if (fs.existsSync(podspec)) {
      patchPodspec(podspec);
    }
  }
}

// Also handle non-pnpm layouts (npm / yarn / direct hoisting)
const directPodspec = path.join(
  ROOT,
  "node_modules",
  "react-native-health",
  "RNAppleHealthKit.podspec"
);
if (fs.existsSync(directPodspec)) {
  patchPodspec(directPodspec);
}
