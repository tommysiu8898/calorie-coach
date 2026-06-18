import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const AVATAR_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#1e40af",
  "#7c3aed",
];

export default function CommunityProfileSetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useApp();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    groupId?: string;
    groupName?: string;
    fromGuidelines?: string;
    editMode?: string;
  }>();

  const isEditMode = params.editMode === "1";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: existingProfile } = useQuery({
    queryKey: ["communityProfile", userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/community/profile?userId=${userId}`,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{
        displayName: string;
        username: string;
        avatarColor: string;
      }>;
    },
    enabled: !!userId && isEditMode,
  });

  useEffect(() => {
    if (existingProfile) {
      const parts = existingProfile.displayName.split(" ");
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
      setUsername(existingProfile.username);
      setSelectedColor(existingProfile.avatarColor);
      setUsernameStatus("available");
    }
  }, [existingProfile]);

  const checkUsername = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.length < 3) {
        setUsernameStatus(value.length === 0 ? "idle" : "invalid");
        return;
      }
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(value)) {
        setUsernameStatus("invalid");
        return;
      }
      setUsernameStatus("checking");
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/community/username-check?username=${encodeURIComponent(value)}&userId=${userId}`,
          );
          const data = await res.json() as { available: boolean };
          setUsernameStatus(data.available ? "available" : "taken");
        } catch {
          setUsernameStatus("idle");
        }
      }, 600);
    },
    [userId],
  );

  function handleUsernameChange(value: string) {
    setUsername(value);
    checkUsername(value);
  }

  const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const canSubmit =
    firstName.trim().length > 0 &&
    username.length >= 3 &&
    (usernameStatus === "available") &&
    !saving;

  async function handleContinue() {
    if (!userId || !canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/community/profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            displayName,
            username: username.toLowerCase(),
            avatarColor: selectedColor,
            guidelinesAccepted: true,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        if (err.error === "Username already taken") {
          setUsernameStatus("taken");
          return;
        }
        throw new Error(err.error ?? "Failed to save");
      }
      queryClient.invalidateQueries({ queryKey: ["communityProfile", userId] });

      if (isEditMode) {
        router.back();
      } else if (params.groupId) {
        // Join the group then navigate to it
        await fetch(
          `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/groups/${params.groupId}/join`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          },
        );
        queryClient.invalidateQueries({ queryKey: ["groups"] });
        router.replace({
          pathname: "/group-chat",
          params: { groupId: params.groupId, groupName: params.groupName },
        });
      } else {
        router.back();
      }
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const usernameHintColor =
    usernameStatus === "available"
      ? "#22c55e"
      : usernameStatus === "taken" || usernameStatus === "invalid"
      ? "#ef4444"
      : colors.mutedForeground;

  const usernameHint =
    usernameStatus === "checking"
      ? t("community_username_checking")
      : usernameStatus === "available"
      ? t("community_username_available")
      : usernameStatus === "taken"
      ? t("community_username_taken")
      : usernameStatus === "invalid"
      ? t("community_username_invalid")
      : t("community_username_hint");

  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "?";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) + 8,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginBottom: 24, alignSelf: "flex-start" }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={26} color={colors.foreground} />
        </TouchableOpacity>

        <Text style={[st.title, { color: colors.foreground }]}>
          {isEditMode ? t("community_profile_edit_title") : t("community_profile_title")}
        </Text>
        <Text style={[st.subtitle, { color: colors.mutedForeground }]}>
          {isEditMode ? t("community_profile_edit_subtitle") : t("community_profile_subtitle")}
        </Text>

        {/* Avatar preview */}
        <View style={{ alignItems: "center", marginVertical: 24 }}>
          <View
            style={[
              st.avatarPreview,
              { backgroundColor: selectedColor },
            ]}
          >
            <Text style={st.avatarInitials}>{initials}</Text>
          </View>
        </View>

        {/* Display name */}
        <Text style={[st.label, { color: colors.mutedForeground }]}>
          {t("community_display_name")}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <TextInput
            style={[
              st.input,
              {
                flex: 1,
                color: colors.foreground,
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            placeholder={t("community_first_name")}
            placeholderTextColor={colors.mutedForeground}
            value={firstName}
            onChangeText={setFirstName}
            autoCorrect={false}
          />
          <TextInput
            style={[
              st.input,
              {
                flex: 1,
                color: colors.foreground,
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            placeholder={t("community_last_name")}
            placeholderTextColor={colors.mutedForeground}
            value={lastName}
            onChangeText={setLastName}
            autoCorrect={false}
          />
        </View>

        {/* Username */}
        <Text style={[st.label, { color: colors.mutedForeground }]}>
          {t("community_username_label")}
        </Text>
        <View
          style={[
            st.usernameContainer,
            {
              backgroundColor: colors.card,
              borderColor:
                usernameStatus === "available"
                  ? "#22c55e"
                  : usernameStatus === "taken" || usernameStatus === "invalid"
                  ? "#ef4444"
                  : colors.border,
            },
          ]}
        >
          <Text style={[st.atSign, { color: colors.mutedForeground }]}>@</Text>
          <TextInput
            style={[st.usernameInput, { color: colors.foreground, flex: 1 }]}
            placeholder="username"
            placeholderTextColor={colors.mutedForeground}
            value={username}
            onChangeText={handleUsernameChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {usernameStatus === "checking" && (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          )}
          {usernameStatus === "available" && (
            <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          )}
          {(usernameStatus === "taken" || usernameStatus === "invalid") && (
            <Ionicons name="close-circle" size={20} color="#ef4444" />
          )}
        </View>
        <Text style={[st.hint, { color: usernameHintColor }]}>{usernameHint}</Text>

        {/* Avatar colour */}
        <Text style={[st.label, { color: colors.mutedForeground, marginTop: 20 }]}>
          {t("community_avatar_color")}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
        >
          {AVATAR_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              onPress={() => setSelectedColor(color)}
              style={[
                st.colorSwatch,
                { backgroundColor: color },
                selectedColor === color && st.colorSwatchSelected,
              ]}
            >
              {selectedColor === color && (
                <Ionicons name="checkmark" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ height: 16 }} />
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
          paddingTop: 16,
          backgroundColor: colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        }}
      >
        <TouchableOpacity
          onPress={handleContinue}
          disabled={!canSubmit}
          style={[
            st.continueBtn,
            {
              backgroundColor: canSubmit ? colors.foreground : colors.muted,
              opacity: saving ? 0.7 : 1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[st.continueBtnText, { color: canSubmit ? colors.primaryForeground : colors.mutedForeground }]}>
              {isEditMode ? t("save_changes") : t("community_continue")}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  avatarPreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  usernameContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  atSign: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  usernameInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    marginLeft: 4,
  },
  colorSwatch: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.8)",
  },
  continueBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  continueBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
