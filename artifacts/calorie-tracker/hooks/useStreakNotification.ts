import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useApp } from "@/context/AppContext";

const STREAK_NOTIFICATION_ID_KEY = "@calorie_tracker/streakNotifId";
const STREAK_REMINDER_ENABLED_KEY = "@calorie_tracker/streakReminderEnabled";
const STREAK_REMINDER_TIME_KEY = "@calorie_tracker/streakReminderTime";

export const DEFAULT_STREAK_REMINDER_TIME = "7:00 PM";

function parseTime12h(timeStr: string): { hour: number; minute: number } {
  const parts = timeStr.split(/[: ]/);
  let hour = parseInt(parts[0] ?? "7", 10);
  const minute = parseInt(parts[1] ?? "0", 10);
  const period = parts[2] ?? "PM";
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return { hour, minute };
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function requestPermissionsIfNeeded(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function cancelStreakNotification() {
  if (Platform.OS === "web") return;
  try {
    const id = await AsyncStorage.getItem(STREAK_NOTIFICATION_ID_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(STREAK_NOTIFICATION_ID_KEY);
    }
  } catch {
  }
}

async function scheduleStreakNotification(timeStr: string, streakDays: number): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    await cancelStreakNotification();

    const granted = await requestPermissionsIfNeeded();
    if (!granted) return null;

    const { hour, minute } = parseTime12h(timeStr);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Keep your streak alive! 🔥",
        body:
          streakDays > 0
            ? `Don't break your ${streakDays}-day streak! Log a meal to keep it going.`
            : "Log a meal today to start your streak!",
        data: { screen: "log" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });

    await AsyncStorage.setItem(STREAK_NOTIFICATION_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export async function loadStreakReminderSettings(): Promise<{
  enabled: boolean;
  time: string;
}> {
  try {
    const [enabled, time] = await AsyncStorage.multiGet([
      STREAK_REMINDER_ENABLED_KEY,
      STREAK_REMINDER_TIME_KEY,
    ]);
    return {
      enabled: enabled[1] === "true",
      time: time[1] ?? DEFAULT_STREAK_REMINDER_TIME,
    };
  } catch {
    return { enabled: false, time: DEFAULT_STREAK_REMINDER_TIME };
  }
}

export async function saveStreakReminderSettings(
  enabled: boolean,
  time: string,
  streakDays: number,
): Promise<void> {
  await AsyncStorage.multiSet([
    [STREAK_REMINDER_ENABLED_KEY, String(enabled)],
    [STREAK_REMINDER_TIME_KEY, time],
  ]);

  if (enabled) {
    await scheduleStreakNotification(time, streakDays);
  } else {
    await cancelStreakNotification();
  }
}

export async function cancelTodayStreakNudge() {
  await cancelStreakNotification();
}

export async function requestNotificationPermission(): Promise<boolean> {
  return requestPermissionsIfNeeded();
}

export function useStreakNotificationInit(streakDays: number) {
  const { userId } = useApp();
  const initialized = useRef(false);

  useEffect(() => {
    if (!userId || initialized.current || Platform.OS === "web") return;
    initialized.current = true;

    async function init() {
      try {
        const settings = await loadStreakReminderSettings();
        if (!settings.enabled) return;

        await scheduleStreakNotification(settings.time, streakDays);

        const domain = process.env.EXPO_PUBLIC_DOMAIN;
        if (!domain || !userId) return;

        let token: string | null = null;
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          token = tokenData.data;
        } catch {
        }

        if (token) {
          await fetch(`https://${domain}/api/push-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, token }),
          }).catch(() => {});
        }

        const localDate = new Date().toISOString().split("T")[0];
        await fetch(`https://${domain}/api/notifications/streak-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, localDate }),
        }).catch(() => {});
      } catch {
      }
    }

    init();
  }, [userId, streakDays]);
}
