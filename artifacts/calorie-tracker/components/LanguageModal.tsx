import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  StyleSheet,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface Language {
  code: string;
  flag: string;
  label: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "zh-TW", flag: "🇹🇼", label: "繁體中文" },
  { code: "zh-CN", flag: "🇨🇳", label: "简体中文" },
  { code: "hi", flag: "🇮🇳", label: "हिन्दी" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
  { code: "pt", flag: "🇧🇷", label: "Português" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "ro", flag: "🇷🇴", label: "Română" },
  { code: "az", flag: "🇦🇿", label: "Azərbaycanca" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
  { code: "pl", flag: "🇵🇱", label: "Polski" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "ar", flag: "🇸🇦", label: "العربية" },
  { code: "sv", flag: "🇸🇪", label: "Svenska" },
];

interface LanguageModalProps {
  visible: boolean;
  selectedCode: string;
  onSelect: (lang: Language) => void;
  onClose: () => void;
}

export default function LanguageModal({ visible, selectedCode, onSelect, onClose }: LanguageModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable
          style={[
            s.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 16,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={[s.header, { borderBottomColor: colors.border }]}>
            <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              Select Language
            </Text>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={[s.closeBtn, { backgroundColor: colors.muted }]}
            >
              <Ionicons name="close" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Language list */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 4 }}
            style={{ maxHeight: Platform.OS === "web" ? 420 : undefined }}
          >
            {LANGUAGES.map((lang, i) => {
              const isSelected = lang.code === selectedCode;
              const isLast = i === LANGUAGES.length - 1;
              return (
                <TouchableOpacity
                  key={lang.code}
                  onPress={() => { onSelect(lang); onClose(); }}
                  activeOpacity={0.7}
                  style={[
                    s.row,
                    {
                      borderBottomWidth: isLast ? 0 : 0.5,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                    <Text style={{ fontSize: 26 }}>{lang.flag}</Text>
                    <Text
                      style={{
                        fontSize: 17,
                        fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular",
                        color: colors.foreground,
                      }}
                    >
                      {lang.label}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={[s.checkCircle, { backgroundColor: colors.foreground }]}>
                      <Ionicons name="checkmark" size={14} color={colors.primaryForeground} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    maxHeight: "85%",
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    marginBottom: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
