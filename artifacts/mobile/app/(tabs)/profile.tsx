import { Feather } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiPut } from "@/constants/api";
import type { Employee } from "@/types";

const PRESET_COLORS = [
  "#1a7a3c",
  "#9b72ff",
  "#d68910",
  "#1a5fb4",
  "#c0392b",
  "#6c3483",
  "#117a8b",
  "#6d4c41",
  "#00695c",
  "#2e7d32",
];

const PIN_LENGTH = 4;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
      {title}
    </Text>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "numeric";
  multiline?: boolean;
  editable?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TextInput
        style={[
          styles.fieldInput,
          {
            color: editable ? colors.foreground : colors.mutedForeground,
            textAlign: "right",
            height: multiline ? 64 : undefined,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ""}
        placeholderTextColor={colors.mutedForeground + "80"}
        keyboardType={keyboardType ?? "default"}
        editable={editable}
        multiline={multiline}
      />
    </View>
  );
}

const KEYPAD_KEYS = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "", "0", "⌫",
];

function PinDots({ pin, shake }: { pin: string; shake: Animated.Value }) {
  return (
    <Animated.View
      style={[
        styles.dotsRow,
        {
          transform: [
            {
              translateX: shake.interpolate({
                inputRange: [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1],
                outputRange: [0, -8, 8, -8, 8, -4, 0],
              }),
            },
          ],
        },
      ]}
    >
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i < pin.length ? "#1a7a3c" : "transparent",
              borderColor: i < pin.length ? "#1a7a3c" : "#ccc",
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

function PinModal({
  visible,
  onClose,
  empId,
  hasPin,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  empId: number;
  hasPin: boolean;
  onSuccess: () => void;
}) {
  const colors = useColors();
  const [step, setStep] = useState<"old" | "new" | "confirm">(hasPin ? "old" : "new");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setStep(hasPin ? "old" : "new");
      setOldPin("");
      setNewPin("");
      setConfirmPin("");
      setError("");
    }
  }, [visible, hasPin]);

  const doShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start();
  };

  const currentPin =
    step === "old" ? oldPin : step === "new" ? newPin : confirmPin;

  const setCurrentPin = (v: string) => {
    if (step === "old") setOldPin(v);
    else if (step === "new") setNewPin(v);
    else setConfirmPin(v);
  };

  const handleKey = (k: string) => {
    if (currentPin.length < PIN_LENGTH && !busy) {
      const next = currentPin + k;
      setCurrentPin(next);
      if (next.length === PIN_LENGTH) {
        setTimeout(() => handleComplete(next), 50);
      }
    }
  };

  const handleDelete = () => {
    if (!busy) setCurrentPin(currentPin.slice(0, -1));
  };

  const handleComplete = async (pin: string) => {
    if (step === "old") {
      setOldPin(pin);
      setStep("new");
      setCurrentPin("");
      setNewPin("");
    } else if (step === "new") {
      setNewPin(pin);
      setStep("confirm");
      setCurrentPin("");
      setConfirmPin("");
    } else {
      if (pin !== newPin) {
        setError("PIN-коды не совпадают");
        doShake();
        setTimeout(() => {
          setConfirmPin("");
          setNewPin("");
          setStep("new");
          setError("");
        }, 900);
        return;
      }
      setBusy(true);
      try {
        await apiPut(`/api/employees/${empId}/pin`, {
          new_pin: newPin,
          old_pin: hasPin ? oldPin : undefined,
        });
        onSuccess();
        onClose();
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("401")) {
          setError("Неверный текущий PIN");
        } else {
          setError("Ошибка сохранения PIN");
        }
        doShake();
        setTimeout(() => {
          setOldPin("");
          setNewPin("");
          setConfirmPin("");
          setStep(hasPin ? "old" : "new");
          setError("");
        }, 900);
      } finally {
        setBusy(false);
      }
    }
  };

  if (!visible) return null;

  const title =
    step === "old"
      ? "Введите текущий PIN"
      : step === "new"
      ? "Введите новый PIN"
      : "Повторите новый PIN";

  return (
    <View
      style={[
        styles.pinModalOverlay,
        { backgroundColor: "rgba(0,0,0,0.5)" },
      ]}
    >
      <View style={[styles.pinModalCard, { backgroundColor: colors.card }]}>
        <View style={styles.pinModalHeader}>
          <Text style={[styles.pinModalTitle, { color: colors.foreground }]}>
            {title}
          </Text>
          <Pressable onPress={onClose}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <PinDots pin={currentPin} shake={shakeAnim} />

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <View style={{ height: 18 }} />
        )}

        {busy ? (
          <ActivityIndicator color="#1a7a3c" style={{ marginTop: 16 }} />
        ) : (
          <View style={styles.keypad}>
            {KEYPAD_KEYS.map((key, idx) => {
              if (key === "")
                return <View key={idx} style={styles.keyEmpty} />;
              const isDelete = key === "⌫";
              return (
                <Pressable
                  key={idx}
                  style={({ pressed }) => [
                    styles.keyBtn,
                    {
                      backgroundColor: pressed
                        ? colors.primary + "20"
                        : colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() =>
                    isDelete ? handleDelete() : handleKey(key)
                  }
                >
                  {isDelete ? (
                    <Feather
                      name="delete"
                      size={20}
                      color={colors.foreground}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.keyText,
                        { color: colors.foreground },
                      ]}
                    >
                      {key}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout, updateUser, refreshUser } = useAuth();
  const colors = useColors();

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [tgId, setTgId] = useState(user?.tg_id ? String(user.tg_id) : "");
  const [color, setColor] = useState(user?.color ?? "#1a7a3c");
  const [showPinModal, setShowPinModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone ?? "");
      setBio(user.bio ?? "");
      setTgId(user.tg_id ? String(user.tg_id) : "");
      setColor(user.color);
    }
  }, [user]);

  if (!user) return null;

  const hasChanges =
    name !== (user.name ?? "") ||
    phone !== (user.phone ?? "") ||
    bio !== (user.bio ?? "") ||
    tgId !== (user.tg_id ? String(user.tg_id) : "") ||
    color !== (user.color ?? "#1a7a3c");

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const updated = await apiPut<Employee>(`/api/employees/${user.id}/profile`, {
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        tg_id: tgId ? parseInt(tgId) : undefined,
        color,
      });
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    Alert.alert("Выход", "Выйти из профиля?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Выйти",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topHeader}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>
              Профиль
            </Text>
            {hasChanges && (
              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : saved ? (
                  <Feather name="check" size={16} color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Сохранить</Text>
                )}
              </Pressable>
            )}
          </View>

          <View style={styles.avatarSection}>
            <View
              style={[
                styles.bigAvatar,
                { backgroundColor: color + "30" },
              ]}
            >
              <Text style={[styles.bigAvatarText, { color }]}>
                {getInitials(name || user.name)}
              </Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={[styles.avatarName, { color: colors.foreground }]}>
                {name || user.name}
              </Text>
              <Text
                style={[
                  styles.avatarRole,
                  { color: colors.mutedForeground },
                ]}
              >
                {user.role}
              </Text>
              <View style={styles.badgeRow}>
                {user.is_admin ? (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: "#1a7a3c20" },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: "#1a7a3c" }]}>
                      Админ
                    </Text>
                  </View>
                ) : null}
                {user.is_hr ? (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: "#9b72ff20" },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: "#9b72ff" }]}>
                      HR
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <SectionHeader title="ЛИЧНЫЕ ДАННЫЕ" />
            <Field
              label="Имя"
              value={name}
              onChangeText={setName}
              placeholder="Ваше имя"
            />
            <Field
              label="Должность"
              value={user.role}
              editable={false}
            />
            <Field
              label="Телефон"
              value={phone}
              onChangeText={setPhone}
              placeholder="+992 ..."
              keyboardType="phone-pad"
            />
            <Field
              label="Telegram ID"
              value={tgId}
              onChangeText={setTgId}
              placeholder="123456789"
              keyboardType="numeric"
            />
            <Field
              label="О себе"
              value={bio}
              onChangeText={setBio}
              placeholder="Кратко о себе..."
              multiline
            />
          </View>

          <View
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <SectionHeader title="ЦВЕТ ПРОФИЛЯ" />
            <View style={styles.colorRow}>
              {PRESET_COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorDot,
                    {
                      backgroundColor: c,
                      borderWidth: color === c ? 3 : 0,
                      borderColor: "#fff",
                      shadowColor: color === c ? c : "transparent",
                      shadowRadius: color === c ? 6 : 0,
                      shadowOpacity: 0.7,
                      elevation: color === c ? 4 : 0,
                    },
                  ]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>
          </View>

          <View
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <SectionHeader title="БЕЗОПАСНОСТЬ" />
            <Pressable
              style={[styles.actionRow, { borderBottomColor: colors.border }]}
              onPress={() => setShowPinModal(true)}
            >
              <View style={styles.actionLeft}>
                <View
                  style={[
                    styles.actionIcon,
                    { backgroundColor: "#1a7a3c20" },
                  ]}
                >
                  <Feather name="lock" size={18} color="#1a7a3c" />
                </View>
                <View>
                  <Text
                    style={[
                      styles.actionLabel,
                      { color: colors.foreground },
                    ]}
                  >
                    {user.pin ? "Изменить PIN-код" : "Установить PIN-код"}
                  </Text>
                  <Text
                    style={[
                      styles.actionSub,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {user.pin ? "4-значный код для входа" : "Защита профиля PIN-кодом"}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <SectionHeader title="АККАУНТ" />
            <Pressable
              style={[styles.actionRow, { borderBottomWidth: 0 }]}
              onPress={handleLogout}
            >
              <View style={styles.actionLeft}>
                <View
                  style={[styles.actionIcon, { backgroundColor: "#e74c3c20" }]}
                >
                  <Feather name="log-out" size={18} color="#e74c3c" />
                </View>
                <Text style={[styles.actionLabel, { color: "#e74c3c" }]}>
                  Выйти из профиля
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#e74c3c60" />
            </Pressable>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <PinModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        empId={user.id}
        hasPin={!!user.pin}
        onSuccess={() => {
          refreshUser();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 88,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  avatarSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  bigAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  bigAvatarText: { fontSize: 28, fontFamily: "Inter_700Bold" },
  avatarInfo: { flex: 1 },
  avatarName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  avatarRole: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  fieldInput: {
    flex: 2,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 16,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  actionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  pinModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    zIndex: 100,
  },
  pinModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  pinModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 20,
  },
  pinModalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  errorText: {
    color: "#e74c3c",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    height: 18,
    textAlign: "center",
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 280,
    marginTop: 12,
    gap: 10,
  },
  keyBtn: {
    width: 82,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  keyEmpty: { width: 82, height: 58 },
  keyText: { fontSize: 22, fontFamily: "Inter_500Medium" },
});
