import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  loadStreakReminderSettings,
  saveStreakReminderSettings,
  requestNotificationPermission,
  DEFAULT_STREAK_REMINDER_TIME,
} from "@/hooks/useStreakNotification";

type AppColors = ReturnType<typeof import("@/hooks/useColors").useColors>;

interface MealReminder {
  id: string;
  time: string;
  enabled: boolean;
}

const INITIAL_REMINDERS: MealReminder[] = [
  { id: "breakfast", time: "8:30 AM", enabled: true },
  { id: "lunch", time: "11:30 AM", enabled: true },
  { id: "snack", time: "4:00 PM", enabled: false },
  { id: "dinner", time: "6:00 PM", enabled: true },
];

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = ["00", "15", "30", "45"];
const PERIODS = ["AM", "PM"];

function TimePicker({
  visible,
  time,
  onConfirm,
  onCancel,
  colors,
  t,
}: {
  visible: boolean;
  time: string;
  onConfirm: (t: string) => void;
  onCancel: () => void;
  colors: AppColors;
  t: (k: string) => string;
}) {
  const parts = time.split(/[: ]/);
  const [hour, setHour] = useState(parts[0] ?? "7");
  const [minute, setMinute] = useState(parts[1] ?? "00");
  const [period, setPeriod] = useState(parts[2] ?? "PM");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable
          style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 20 }}>
            {t("tr_set_time")}
          </Text>

          <View style={{ flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "center" }}>
            <View style={{ alignItems: "center", gap: 6 }}>
              <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>{t("hour_label")}</Text>
              <ScrollView style={{ height: 120 }} showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    onPress={() => setHour(h)}
                    style={[
                      styles.pickerItem,
                      { backgroundColor: hour === h ? colors.foreground : colors.muted },
                    ]}
                  >
                    <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: hour === h ? colors.primaryForeground : colors.foreground }}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 20 }}>:</Text>

            <View style={{ alignItems: "center", gap: 6 }}>
              <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>{t("minute_label")}</Text>
              <View style={{ gap: 6 }}>
                {MINUTES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMinute(m)}
                    style={[
                      styles.pickerItem,
                      { backgroundColor: minute === m ? colors.foreground : colors.muted },
                    ]}
                  >
                    <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: minute === m ? colors.primaryForeground : colors.foreground }}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ alignItems: "center", gap: 6 }}>
              <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>{t("tr_period_label")}</Text>
              <View style={{ gap: 6 }}>
                {PERIODS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPeriod(p)}
                    style={[
                      styles.pickerItem,
                      { backgroundColor: period === p ? colors.foreground : colors.muted },
                    ]}
                  >
                    <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: period === p ? colors.primaryForeground : colors.foreground }}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.btn, { backgroundColor: colors.muted, flex: 1 }]}
            >
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{t("cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onConfirm(`${hour}:${minute} ${period}`)}
              style={[styles.btn, { backgroundColor: colors.foreground, flex: 1 }]}
            >
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground }}>{t("tr_set_btn")}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ReminderRow({
  reminder,
  onToggle,
  onTimeChange,
  colors,
  last,
  t,
}: {
  reminder: MealReminder;
  onToggle: () => void;
  onTimeChange: (t: string) => void;
  colors: AppColors;
  last?: boolean;
  t: (k: string) => string;
}) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 16,
          paddingHorizontal: 16,
          borderBottomWidth: last ? 0 : 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
          {t(reminder.id)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            onPress={() => setShowPicker(true)}
            style={{
              backgroundColor: colors.muted,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>
              {reminder.time}
            </Text>
          </TouchableOpacity>
          <Switch
            value={reminder.enabled}
            onValueChange={onToggle}
            trackColor={{ false: colors.border, true: colors.foreground }}
            thumbColor="#ffffff"
            ios_backgroundColor={colors.border}
          />
        </View>
      </View>
      <TimePicker
        visible={showPicker}
        time={reminder.time}
        onConfirm={(val) => { onTimeChange(val); setShowPicker(false); }}
        onCancel={() => setShowPicker(false)}
        colors={colors}
        t={t}
      />
    </>
  );
}

export default function TrackingRemindersScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [reminders, setReminders] = useState(INITIAL_REMINDERS);
  const [endOfDay, setEndOfDay] = useState(false);
  const [endOfDayTime, setEndOfDayTime] = useState("9:00 PM");
  const [showEodPicker, setShowEodPicker] = useState(false);

  const [streakEnabled, setStreakEnabled] = useState(false);
  const [streakTime, setStreakTime] = useState(DEFAULT_STREAK_REMINDER_TIME);
  const [showStreakPicker, setShowStreakPicker] = useState(false);
  const [streakSaving, setStreakSaving] = useState(false);
  const [streakPermissionDenied, setStreakPermissionDenied] = useState(false);
  const [streakLoaded, setStreakLoaded] = useState(false);

  useEffect(() => {
    loadStreakReminderSettings().then(({ enabled, time }) => {
      setStreakEnabled(enabled);
      setStreakTime(time);
      setStreakLoaded(true);
    });
  }, []);

  async function handleStreakToggle(value: boolean) {
    if (Platform.OS === "web") return;

    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setStreakPermissionDenied(true);
        return;
      }
      setStreakPermissionDenied(false);
    }

    setStreakEnabled(value);
    setStreakSaving(true);
    try {
      await saveStreakReminderSettings(value, streakTime, 0);
    } finally {
      setStreakSaving(false);
    }
  }

  async function handleStreakTimeConfirm(time: string) {
    setStreakTime(time);
    setShowStreakPicker(false);
    if (streakEnabled) {
      setStreakSaving(true);
      try {
        await saveStreakReminderSettings(true, time, 0);
      } finally {
        setStreakSaving(false);
      }
    }
  }

  function toggleReminder(id: string) {
    setReminders((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
  }

  function updateTime(id: string, time: string) {
    setReminders((prev) => prev.map((r) => r.id === id ? { ...r, time } : r));
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: insets.top + (Platform.OS === "web" ? 16 : 8),
          paddingHorizontal: 20,
          paddingBottom: 14,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.muted,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 20,
          paddingTop: 28,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.Text
          entering={FadeInDown.delay(0)}
          style={{
            fontSize: 32,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
            marginBottom: 8,
          }}
        >
          {t("tracking_reminders_label")}
        </Animated.Text>

        {/* Streak Protection */}
        <Animated.View entering={FadeInDown.delay(40)}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            {t("tr_streak_section")}
          </Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 16,
                paddingHorizontal: 16,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                  {t("tr_streak_label")}
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                  {t("tr_streak_desc")}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {streakSaving && <ActivityIndicator size="small" color={colors.mutedForeground} />}
                <TouchableOpacity
                  onPress={() => setShowStreakPicker(true)}
                  style={{
                    backgroundColor: colors.muted,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>
                    {streakTime}
                  </Text>
                </TouchableOpacity>
                {Platform.OS !== "web" ? (
                  <Switch
                    value={streakEnabled}
                    onValueChange={handleStreakToggle}
                    trackColor={{ false: colors.border, true: colors.foreground }}
                    thumbColor="#ffffff"
                    ios_backgroundColor={colors.border}
                    disabled={streakSaving || !streakLoaded}
                  />
                ) : (
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                    {t("tr_mobile_only")}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              {streakPermissionDenied ? (
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#ef4444" }}>
                  {t("tr_notif_denied")}
                </Text>
              ) : (
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  {t("tr_streak_hint")}
                </Text>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Meal reminders */}
        <Animated.View entering={FadeInDown.delay(80)}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            {t("tr_meal_section")}
          </Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {reminders.map((reminder, i) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                onToggle={() => toggleReminder(reminder.id)}
                onTimeChange={(val) => updateTime(reminder.id, val)}
                colors={colors}
                last={i === reminders.length - 1}
                t={t}
              />
            ))}
          </View>
        </Animated.View>

        {/* End of Day */}
        <Animated.View entering={FadeInDown.delay(140)}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            {t("tr_eod_section")}
          </Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 16,
                paddingHorizontal: 16,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                {t("tr_eod_section")}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setShowEodPicker(true)}
                  style={{
                    backgroundColor: colors.muted,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>
                    {endOfDayTime}
                  </Text>
                </TouchableOpacity>
                <Switch
                  value={endOfDay}
                  onValueChange={setEndOfDay}
                  trackColor={{ false: colors.border, true: colors.foreground }}
                  thumbColor="#ffffff"
                  ios_backgroundColor={colors.border}
                />
              </View>
            </View>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                {t("tr_eod_desc")}
              </Text>
            </View>
          </View>
        </Animated.View>

        <TimePicker
          visible={showStreakPicker}
          time={streakTime}
          onConfirm={handleStreakTimeConfirm}
          onCancel={() => setShowStreakPicker(false)}
          colors={colors}
          t={t}
        />

        <TimePicker
          visible={showEodPicker}
          time={endOfDayTime}
          onConfirm={(val) => { setEndOfDayTime(val); setShowEodPicker(false); }}
          onCancel={() => setShowEodPicker(false)}
          colors={colors}
          t={t}
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  picker: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
  },
  pickerLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pickerItem: {
    width: 52,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
});
