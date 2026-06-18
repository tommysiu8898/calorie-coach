import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type ChatMessage = {
  id: string;
  userId: string;
  displayName: string;
  avatarColor: string;
  initials: string;
  text: string;
  timestamp: string;
  replyCount: number;
};

type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  initials: string;
  vitalityScore: number;
  streakDays: number;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString();
}

function MessageBubble({
  msg,
  isMe,
  colors,
}: {
  msg: ChatMessage;
  isMe: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={[st.msgRow, isMe && { flexDirection: "row-reverse" }]}>
      <View style={[st.msgAvatar, { backgroundColor: msg.avatarColor }]}>
        <Text style={st.msgAvatarText}>{msg.initials}</Text>
      </View>
      <View style={{ flex: 1, alignItems: isMe ? "flex-end" : "flex-start" }}>
        <View style={{ flexDirection: isMe ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Text style={[st.msgName, { color: colors.foreground }]}>{msg.displayName}</Text>
          <Text style={[st.msgTime, { color: colors.mutedForeground }]}>{formatTime(msg.timestamp)}</Text>
        </View>
        <View
          style={[
            st.msgBubble,
            {
              backgroundColor: isMe ? colors.foreground : colors.card,
              borderColor: colors.border,
              alignSelf: isMe ? "flex-end" : "flex-start",
            },
          ]}
        >
          <Text style={[st.msgText, { color: isMe ? colors.primaryForeground : colors.foreground }]}>
            {msg.text}
          </Text>
        </View>
        {msg.replyCount > 0 && (
          <Text style={[st.replyCount, { color: colors.mutedForeground }]}>
            💬 {msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}
          </Text>
        )}
      </View>
    </View>
  );
}

function LeaderboardRow({
  entry,
  myUserId,
  colors,
}: {
  entry: LeaderboardEntry;
  myUserId: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t } = useI18n();
  const isMe = entry.userId === myUserId;
  const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
  const rankColor = entry.rank <= 3 ? rankColors[entry.rank - 1] : colors.mutedForeground;

  return (
    <View
      style={[
        st.leaderRow,
        {
          backgroundColor: isMe ? colors.primary + "18" : colors.card,
          borderColor: isMe ? colors.primary + "44" : colors.border,
        },
      ]}
    >
      <Text style={{ width: 28, fontSize: 14, fontFamily: "Inter_700Bold", color: rankColor, textAlign: "center" }}>
        {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `${entry.rank}`}
      </Text>
      <View style={[st.lbAvatar, { backgroundColor: isMe ? colors.primary + "33" : colors.muted }]}>
        <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: isMe ? colors.primary : colors.foreground }}>
          {entry.initials}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: isMe ? "Inter_700Bold" : "Inter_500Medium", color: colors.foreground }} numberOfLines={1}>
          {entry.displayName}{isMe ? ` ${t("leaderboard_you")}` : ""}
        </Text>
        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
          🔥 {entry.streakDays} {t("leaderboard_streak_days")}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>{entry.vitalityScore}</Text>
        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t("leaderboard_pts")}</Text>
      </View>
    </View>
  );
}

type GroupMember = {
  userId: string;
  displayName: string;
  username: string;
  avatarColor: string;
  initials: string;
};

function MembersSheet({
  visible,
  onClose,
  groupId,
  groupName,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["groupMembers", groupId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/groups/${groupId}/members`,
      );
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ members: GroupMember[]; count: number }>;
    },
    enabled: visible && !!groupId,
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={st.membersBackdrop} onPress={onClose}>
        <Pressable style={[st.membersSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={[st.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Text style={[st.membersTitle, { color: colors.foreground }]}>
              Members {data?.count ? `(${data.count})` : ""}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {isLoading ? (
            <ActivityIndicator color={colors.foreground} style={{ marginVertical: 32 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              {(data?.members ?? []).map((member) => (
                <View
                  key={member.userId}
                  style={[st.memberRow, { borderBottomColor: colors.border }]}
                >
                  <View style={[st.memberAvatar, { backgroundColor: member.avatarColor }]}>
                    <Text style={st.memberAvatarText}>{member.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.memberName, { color: colors.foreground }]}>
                      {member.displayName}
                    </Text>
                    <Text style={[st.memberUsername, { color: colors.mutedForeground }]}>
                      @{member.username}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function GroupChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useApp();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ groupId: string; groupName: string; groupEmoji?: string }>();
  const groupId = params.groupId ?? "";
  const groupName = params.groupName ?? "Group";
  const groupEmoji = params.groupEmoji ?? "👥";

  const [activeTab, setActiveTab] = useState<"chat" | "leaderboard">("chat");
  const [messageText, setMessageText] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ["groupMessages", groupId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/groups/${groupId}/messages`,
      );
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ messages: ChatMessage[] }>;
    },
    enabled: !!groupId,
  });

  React.useEffect(() => {
    if (messagesData?.messages && localMessages.length === 0) {
      setLocalMessages(messagesData.messages);
    }
  }, [messagesData]);

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ["groupLeaderboard", groupId, userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/groups/${groupId}/leaderboard?userId=${userId}`,
      );
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ leaderboard: LeaderboardEntry[] }>;
    },
    enabled: !!groupId && activeTab === "leaderboard",
  });

  const handleSend = useCallback(async () => {
    const text = messageText.trim();
    if (!text || !userId || sending) return;
    setMessageText("");
    setSending(true);

    // Optimistic update
    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      userId,
      displayName: "You",
      avatarColor: "#6366f1",
      initials: "Y",
      text,
      timestamp: new Date().toISOString(),
      replyCount: 0,
    };
    setLocalMessages((prev) => [...prev, optimistic]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/groups/${groupId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, text }),
        },
      );
      if (res.ok) {
        const data = await res.json() as { message: ChatMessage };
        setLocalMessages((prev) => [
          ...prev.filter((m) => m.id !== optimistic.id),
          data.message,
        ]);
      }
    } catch {
      // keep optimistic
    } finally {
      setSending(false);
    }
  }, [messageText, userId, groupId, sending]);

  const allMessages = localMessages.length > 0 ? localMessages : (messagesData?.messages ?? []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        style={[
          st.header,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8),
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ marginRight: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>

        <View style={[st.groupIcon, { backgroundColor: colors.muted }]}>
          <Text style={{ fontSize: 20 }}>{groupEmoji}</Text>
        </View>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[st.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {groupName}
          </Text>
        </View>

        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => setShowMembers(true)}
        >
          <Ionicons name="people-outline" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[st.tabBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {(["chat", "leaderboard"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              st.tab,
              activeTab === tab && {
                borderBottomWidth: 2,
                borderBottomColor: colors.foreground,
              },
            ]}
          >
            <Text
              style={[
                st.tabText,
                {
                  color: activeTab === tab ? colors.foreground : colors.mutedForeground,
                  fontFamily: activeTab === tab ? "Inter_600SemiBold" : "Inter_400Regular",
                },
              ]}
            >
              {tab === "chat" ? t("group_tab_chat") : t("group_tab_leaderboard")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === "chat" ? (
        <>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              gap: 4,
            }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messagesLoading && allMessages.length === 0 ? (
              <ActivityIndicator color={colors.foreground} style={{ marginTop: 40 }} />
            ) : allMessages.length === 0 ? (
              <View style={{ alignItems: "center", marginTop: 60 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
                <Text style={[st.emptyText, { color: colors.mutedForeground }]}>
                  {t("group_chat_empty")}
                </Text>
              </View>
            ) : (
              allMessages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isMe={msg.userId === userId}
                  colors={colors}
                />
              ))
            )}
          </ScrollView>

          {/* Input bar */}
          <View
            style={[
              st.inputBar,
              {
                paddingBottom: insets.bottom + 8,
                backgroundColor: colors.background,
                borderTopColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity style={st.cameraBtn}>
              <Ionicons name="camera-outline" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TextInput
              style={[
                st.messageInput,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                  flex: 1,
                },
              ]}
              placeholder={t("group_chat_placeholder")}
              placeholderTextColor={colors.mutedForeground}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!messageText.trim() || sending}
              style={[
                st.sendBtn,
                {
                  backgroundColor: messageText.trim() ? colors.foreground : colors.muted,
                },
              ]}
            >
              <Ionicons
                name="send"
                size={18}
                color={messageText.trim() ? colors.primaryForeground : colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingVertical: 16,
            paddingBottom: insets.bottom + 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          {leaderboardLoading ? (
            <ActivityIndicator color={colors.foreground} style={{ marginTop: 40 }} />
          ) : (leaderboardData?.leaderboard ?? []).length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🏆</Text>
              <Text style={[st.emptyText, { color: colors.mutedForeground }]}>
                {t("leaderboard_empty")}
              </Text>
            </View>
          ) : (
            (leaderboardData?.leaderboard ?? []).map((entry) => (
              <LeaderboardRow
                key={entry.userId}
                entry={entry}
                myUserId={userId ?? ""}
                colors={colors}
              />
            ))
          )}
        </ScrollView>
      )}
      <MembersSheet
        visible={showMembers}
        onClose={() => setShowMembers(false)}
        groupId={groupId}
        groupName={groupName}
        colors={colors}
      />
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  tabText: {
    fontSize: 14,
  },
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  msgAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 20,
  },
  msgAvatarText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  msgName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  msgTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  msgBubble: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "80%",
  },
  msgText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  replyCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cameraBtn: {
    paddingBottom: 10,
  },
  messageInput: {
    borderWidth: 1.5,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    flexShrink: 0,
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  lbAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  membersBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  membersSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  membersTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  memberAvatarText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  memberName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  memberUsername: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
