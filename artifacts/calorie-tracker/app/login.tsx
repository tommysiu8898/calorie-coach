import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  useColorScheme,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useSSO } from "@clerk/expo";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { useApp } from "@/context/AppContext";

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <Path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </Svg>
  );
}

export default function LoginScreen() {
  useWarmUpBrowser();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { continueAnonymously } = useApp();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [anonLoading, setAnonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startSSOFlow: startGoogleSSO } = useSSO();
  const { startSSOFlow: startAppleSSO } = useSSO();

  const colors = {
    bg: isDark ? "#0d1117" : "#f8f9fa",
    foreground: isDark ? "#f0f6fc" : "#111827",
    muted: isDark ? "#8b949e" : "#6b7280",
    border: isDark ? "#30363d" : "#e5e7eb",
  };

  const handleGoogleSignIn = useCallback(async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const { createdSessionId, setActive } = await startGoogleSSO({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      if (!msg.toLowerCase().includes("cancel")) {
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }, [startGoogleSSO]);

  const handleAppleSignIn = useCallback(async () => {
    setAppleLoading(true);
    setError(null);
    try {
      const { createdSessionId, setActive } = await startAppleSSO({
        strategy: "oauth_apple",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      if (!msg.toLowerCase().includes("cancel")) {
        setError("Apple sign-in failed. Please try again.");
      }
    } finally {
      setAppleLoading(false);
    }
  }, [startAppleSSO]);

  const handleContinueAnonymously = useCallback(async () => {
    setAnonLoading(true);
    setError(null);
    try {
      await continueAnonymously();
    } catch {
      setError("Something went wrong. Please try again.");
      setAnonLoading(false);
    }
  }, [continueAnonymously]);

  const isAnyLoading = googleLoading || appleLoading || anonLoading;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[
        st.scrollContent,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Animated.View entering={FadeIn.duration(600)} style={st.heroSection}>
        <View style={[st.iconRing, { borderColor: colors.border }]}>
          <Text style={st.iconEmoji}>🔥</Text>
        </View>
        <Text style={[st.appName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          CalorieCam
        </Text>
        <Text style={[st.tagline, { color: colors.muted, fontFamily: "Inter_400Regular" }]}>
          Track smarter. Eat better.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).duration(400)} style={st.formSection}>
        <Text style={[st.heading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Get started
        </Text>

        {error ? (
          <Animated.View
            entering={FadeIn}
            style={[
              st.errorBox,
              {
                backgroundColor: isDark ? "#2d1b1b" : "#fef2f2",
                borderColor: isDark ? "#7f1d1d" : "#fecaca",
              },
            ]}
          >
            <Text style={[st.errorText, { color: isDark ? "#fca5a5" : "#dc2626", fontFamily: "Inter_400Regular" }]}>
              {error}
            </Text>
          </Animated.View>
        ) : null}

        <TouchableOpacity
          style={[
            st.oauthBtn,
            {
              backgroundColor: "#ffffff",
              borderColor: "#e5e7eb",
              opacity: isAnyLoading ? 0.6 : 1,
            },
          ]}
          onPress={handleGoogleSignIn}
          disabled={isAnyLoading}
          activeOpacity={0.8}
        >
          {googleLoading ? (
            <ActivityIndicator size="small" color="#4285F4" />
          ) : (
            <GoogleLogo size={20} />
          )}
          <Text style={[st.oauthBtnText, { color: "#111827", fontFamily: "Inter_500Medium" }]}>
            Continue with Google
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            st.oauthBtn,
            {
              backgroundColor: "#000000",
              borderColor: "#000000",
              opacity: isAnyLoading ? 0.6 : 1,
            },
          ]}
          onPress={handleAppleSignIn}
          disabled={isAnyLoading}
          activeOpacity={0.8}
        >
          {appleLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="logo-apple" size={20} color="#ffffff" />
          )}
          <Text style={[st.oauthBtnText, { color: "#ffffff", fontFamily: "Inter_500Medium" }]}>
            Continue with Apple
          </Text>
        </TouchableOpacity>

        <View style={st.dividerRow}>
          <View style={[st.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[st.dividerText, { color: colors.muted, fontFamily: "Inter_400Regular" }]}>
            or
          </Text>
          <View style={[st.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <TouchableOpacity
          style={[st.anonBtn, { opacity: isAnyLoading ? 0.5 : 1 }]}
          onPress={handleContinueAnonymously}
          disabled={isAnyLoading}
          activeOpacity={0.7}
        >
          {anonLoading ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : (
            <Text style={[st.anonBtnText, { color: colors.muted, fontFamily: "Inter_400Regular" }]}>
              Continue without account
            </Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(400)} style={st.footer}>
        <Text style={[st.footerText, { color: colors.muted, fontFamily: "Inter_400Regular" }]}>
          By continuing you agree to our{" "}
          <Text style={{ color: colors.foreground }}>Terms</Text>
          {" "}and{" "}
          <Text style={{ color: colors.foreground }}>Privacy Policy</Text>
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    alignItems: "stretch",
  },
  heroSection: {
    alignItems: "center",
    paddingTop: 48,
    paddingBottom: 40,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  iconEmoji: {
    fontSize: 44,
  },
  appName: {
    fontSize: 28,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    textAlign: "center",
  },
  formSection: {
    width: "100%",
    paddingBottom: 8,
  },
  heading: {
    fontSize: 20,
    marginBottom: 20,
    textAlign: "center",
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    textAlign: "center",
  },
  oauthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  oauthBtnText: {
    fontSize: 15,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
  },
  anonBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  anonBtnText: {
    fontSize: 14,
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
  },
  footer: {
    alignItems: "center",
    paddingTop: 24,
  },
  footerText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
