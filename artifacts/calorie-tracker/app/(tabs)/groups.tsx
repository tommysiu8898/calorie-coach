import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";

type AppColors = ReturnType<typeof import("@/hooks/useColors").useColors>;

interface Group {
  id: string;
  name: string;
  description: string;
  emoji: string;
  topic: string;
  memberCount: number;
  joined: boolean;
}

interface CommunityProfile {
  userId: string;
  displayName: string;
  username: string;
  avatarColor: string;
  guidelinesAccepted: boolean;
}

function GroupCard({
  group,
  colors,
  onPress,
}: {
  group: Group;
  colors: AppColors;
  onPress: () => void;
}) {
  const { t } = useI18n();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        st.groupCard,
        {
          backgroundColor: colors.card,
          borderColor: group.joined ? colors.foreground + "44" : colors.border,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={[st.emojiCircle, { backgroundColor: colors.muted }]}>
          <Text style={{ fontSize: 24 }}>{group.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <Text style={[st.groupName, { color: colors.foreground }]} numberOfLines={1}>
              {group.name}
            </Text>
            {group.joined && (
              <View style={[st.joinedPill, { backgroundColor: colors.foreground }]}>
                <Text style={[st.joinedPillText, { color: colors.primaryForeground }]}>
                  {t("challenge_joined")}
                </Text>
              </View>
            )}
          </View>
          <Text style={[st.groupDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {group.description}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" }}>
            <View style={[st.topicPill, { backgroundColor: colors.muted }]}>
              <Text style={[st.topicText, { color: colors.mutedForeground }]}>{group.topic}</Text>
            </View>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
              <Ionicons name="people-outline" size={12} color={colors.mutedForeground} />{" "}
              {group.memberCount.toLocaleString()} {t("group_members")}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

function JoinBottomSheet({
  group,
  visible,
  onClose,
  onJoin,
  profileLoading,
  colors,
}: {
  group: Group | null;
  visible: boolean;
  onClose: () => void;
  onJoin: (group: Group) => void;
  profileLoading: boolean;
  colors: AppColors;
}) {
  const { t } = useI18n();
  if (!group) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={st.sheetBackdrop} onPress={onClose}>
        <Pressable style={[st.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={[st.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={[st.emojiCircleLg, { backgroundColor: colors.muted }]}>
              <Text style={{ fontSize: 32 }}>{group.emoji}</Text>
            </View>
            <Text style={[st.sheetTitle, { color: colors.foreground }]}>{group.name}</Text>
            <View style={[st.topicPill, { backgroundColor: colors.muted, marginTop: 6 }]}>
              <Text style={[st.topicText, { color: colors.mutedForeground }]}>{group.topic}</Text>
            </View>
          </View>
          <Text style={[st.sheetDesc, { color: colors.mutedForeground }]}>{group.description}</Text>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 20, marginVertical: 16 }}>
            <View style={{ alignItems: "center" }}>
              <Text style={[st.sheetStat, { color: colors.foreground }]}>
                {group.memberCount.toLocaleString()}
              </Text>
              <Text style={[st.sheetStatLabel, { color: colors.mutedForeground }]}>
                {t("group_members")}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => !profileLoading && onJoin(group)}
            disabled={profileLoading}
            style={[st.joinBtn, { backgroundColor: profileLoading ? colors.muted : colors.foreground }]}
          >
            {profileLoading ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Text style={[st.joinBtnText, { color: colors.primaryForeground }]}>
                {t("group_join_btn")}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
              {t("cancel")}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function GroupsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useApp();
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const {
    data: groupsData,
    isLoading: groupsLoading,
    refetch: refetchGroups,
  } = useQuery<{ groups: Group[] }>({
    queryKey: ["groups", userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/groups?userId=${userId}`,
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: communityProfile, isLoading: profileLoading } = useQuery<CommunityProfile | null>({
    queryKey: ["communityProfile", userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/community/profile?userId=${userId}`,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchGroups();
    setRefreshing(false);
  }, [refetchGroups]);

  const groups = groupsData?.groups ?? [];
  const myGroups = groups.filter((g) => g.joined);
  const allGroups = groups.filter((g) => !g.joined);

  function handleGroupPress(group: Group) {
    if (group.joined) {
      router.push({
        pathname: "/group-chat",
        params: { groupId: group.id, groupName: group.name, groupEmoji: group.emoji },
      });
    } else {
      setSelectedGroup(group);
      setSheetVisible(true);
    }
  }

  async function handleJoin(group: Group) {
    setSheetVisible(false);
    // Check if user has community profile
    if (!communityProfile) {
      // No profile → go through guidelines → profile setup
      router.push({
        pathname: "/community-guidelines",
        params: { groupId: group.id, groupName: group.name },
      });
    } else if (!communityProfile.guidelinesAccepted) {
      router.push({
        pathname: "/community-guidelines",
        params: { groupId: group.id, groupName: group.name },
      });
    } else {
      // Has profile with guidelines accepted → join directly
      try {
        await fetch(
          `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/groups/${group.id}/join`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          },
        );
        queryClient.invalidateQueries({ queryKey: ["groups"] });
        router.push({
          pathname: "/group-chat",
          params: { groupId: group.id, groupName: group.name, groupEmoji: group.emoji },
        });
      } catch {
        // ignore
      }
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.foreground} />
        }
      >
        <View style={{ marginBottom: 20 }}>
          <Text style={[st.title, { color: colors.foreground }]}>{t("community_title")}</Text>
          <Text style={[st.subtitle, { color: colors.mutedForeground }]}>
            {t("groups_subtitle")}
          </Text>
        </View>

        {groupsLoading ? (
          <ActivityIndicator color={colors.foreground} style={{ marginVertical: 40 }} />
        ) : (
          <>
            {myGroups.length > 0 && (
              <>
                <Text style={[st.sectionLabel, { color: colors.mutedForeground }]}>
                  {t("my_groups")}
                </Text>
                {myGroups.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    colors={colors}
                    onPress={() => handleGroupPress(g)}
                  />
                ))}
              </>
            )}

            {allGroups.length > 0 && (
              <>
                <Text style={[st.sectionLabel, { color: colors.mutedForeground, marginTop: myGroups.length > 0 ? 20 : 0 }]}>
                  {t("discover_groups")}
                </Text>
                {allGroups.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    colors={colors}
                    onPress={() => handleGroupPress(g)}
                  />
                ))}
              </>
            )}

            {groups.length === 0 && (
              <View style={[st.emptyBox, { borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>
                  {t("no_groups")}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <JoinBottomSheet
        group={selectedGroup}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onJoin={handleJoin}
        profileLoading={profileLoading}
        colors={colors}
      />
    </View>
  );
}

const st = StyleSheet.create({
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  groupCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  emojiCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  emojiCircleLg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  groupName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  groupDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginTop: 2,
  },
  topicPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  topicText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  joinedPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  joinedPillText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  sheetDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 4,
  },
  sheetStat: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  sheetStatLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 2,
  },
  joinBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  joinBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  emptyBox: {
    alignItems: "center",
    padding: 28,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginBottom: 12,
  },
});
