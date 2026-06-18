import { useColorScheme } from "react-native";
import { useContext } from "react";
import { AppContext } from "@/context/AppContext";
import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 *
 * Respects the user's in-app theme preference (light / dark / system).
 * When set to "system", falls back to the device's appearance setting.
 * Persists across app restarts via AsyncStorage (managed by AppContext).
 */
export function useColors() {
  const { themeMode } = useContext(AppContext);
  const systemScheme = useColorScheme();

  const effectiveScheme =
    themeMode === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : themeMode;

  const palette = effectiveScheme === "dark" ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
