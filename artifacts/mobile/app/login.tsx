import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiGet, apiPut } from "@/constants/api";
import type { Employee } from "@/types";

type Step = "select" | "pin_enter" | "pin_setup" | "pin_confirm";

const PIN_LENGTH = 4;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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
              backgroundColor:
                i < pin.length ? "#1a7a3c" : "transparent",
              borderColor: i < pin.length ? "#1a7a3c" : "#ccc",
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

function Keypad({
  onPress,
  onDelete,
  disabled,
}: {
  onPress: (k: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.keypad}>
      {KEYPAD_KEYS.map((key, idx) => {
        if (key === "") return <View key={idx} style={styles.keyEmpty} />;
        const isDelete = key === "⌫";
        return (
          <Pressable
            key={idx}
            style={({ pressed }) => [
              styles.keyBtn,
              {
                backgroundColor: pressed
                  ? colors.primary + "20"
                  : colors.card,
                borderColor: colors.border,
                opacity: disabled ? 0.5 : 1,
              },
            ]}
            onPress={() => (isDelete ? onDelete() : onPress(key))}
            disabled={disabled}
          >
            {isDelete ? (
              <Feather name="delete" size={22} color={colors.foreground} />
            ) : (
              <Text style={[styles.keyText, { color: colors.foreground }]}>
                {key}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function EmployeeCard({
  emp,
  onPress,
}: {
  emp: Employee;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.empCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      onPress={onPress}
    >
      <View style={[styles.avatar, { backgroundColor: emp.bg || emp.color + "30" }]}>
        {emp.avatar ? (
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          <Text style={[styles.avatarText, { color: emp.color }]}>
            {getInitials(emp.name)}
          </Text>
        ) : (
          <Text style={[styles.avatarText, { color: emp.color }]}>
            {getInitials(emp.name)}
          </Text>
        )}
        <View style={[styles.colorDot, { backgroundColor: emp.color }]} />
      </View>
      <Text
        style={[styles.empName, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {emp.name}
      </Text>
      <Text
        style={[styles.empRole, { color: colors.mutedForeground }]}
        numberOfLines={1}
      >
        {emp.role}
      </Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const { user, isLoading, login, updateUser } = useAuth();
  const colors = useColors();

  const [step, setStep] = useState<Step>("select");
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const { data: employees = [], isLoading: empsLoading } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
    staleTime: 1000 * 60,
  });

  const doShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handlePinComplete();
    }
  }, [pin]);

  async function handlePinComplete() {
    if (!selectedEmp) return;

    if (step === "pin_enter") {
      setBusy(true);
      const result = await login(selectedEmp.id, pin);
      setBusy(false);
      if (result.success) {
        router.replace("/(tabs)");
      } else {
        setError(result.error ?? "Неверный PIN-код");
        doShake();
        setTimeout(() => { setPin(""); setError(""); }, 800);
      }
    } else if (step === "pin_setup") {
      setFirstPin(pin);
      setStep("pin_confirm");
      setPin("");
    } else if (step === "pin_confirm") {
      if (pin !== firstPin) {
        setError("PIN-коды не совпадают");
        doShake();
        setTimeout(() => { setPin(""); setFirstPin(""); setError(""); setStep("pin_setup"); }, 800);
        return;
      }
      setBusy(true);
      try {
        await apiPut(`/api/employees/${selectedEmp.id}/pin`, { new_pin: pin });
        const result = await login(selectedEmp.id, pin);
        if (result.success) {
          router.replace("/(tabs)");
        }
      } catch {
        setError("Ошибка сохранения PIN-кода");
        doShake();
        setTimeout(() => { setPin(""); setError(""); }, 800);
      } finally {
        setBusy(false);
      }
    }
  }

  function handleSelectEmployee(emp: Employee) {
    setSelectedEmp(emp);
    setPin("");
    setFirstPin("");
    setError("");
    setStep(emp.pin ? "pin_enter" : "pin_setup");
  }

  function handleKeyPress(k: string) {
    if (pin.length < PIN_LENGTH && !busy) setPin((p) => p + k);
  }

  function handleDelete() {
    if (!busy) setPin((p) => p.slice(0, -1));
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (user) return <Redirect href="/(tabs)" />;

  const isPinStep = step !== "select";

  const stepTitle =
    step === "pin_enter"
      ? "Введите PIN-код"
      : step === "pin_setup"
      ? "Создайте PIN-код"
      : "Повторите PIN-код";


  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>П</Text>
          </View>
          <View>
            <Text style={[styles.logoTitle, { color: colors.foreground }]}>
              Пойтахт
            </Text>
            <Text style={[styles.logoSub, { color: colors.mutedForeground }]}>
              Корпоративное управление
            </Text>
          </View>
        </View>
      </View>

      {!isPinStep ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Выберите профиль
          </Text>
          {empsLoading ? (
            <ActivityIndicator
              style={{ marginTop: 40 }}
              color={colors.primary}
            />
          ) : (
            <FlatList
              data={employees}
              keyExtractor={(e) => String(e.id)}
              numColumns={2}
              contentContainerStyle={styles.empGrid}
              columnWrapperStyle={styles.empRow}
              renderItem={({ item }) => (
                <EmployeeCard
                  emp={item}
                  onPress={() => handleSelectEmployee(item)}
                />
              )}
            />
          )}
        </>
      ) : (
        <View style={styles.pinContainer}>
          <Pressable
            style={styles.backBtn}
            onPress={() => {
              setStep("select");
              setSelectedEmp(null);
              setPin("");
              setError("");
            }}
          >
            <Feather name="arrow-left" size={20} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>
              Назад
            </Text>
          </Pressable>

          {selectedEmp && (
            <View style={styles.selectedEmpRow}>
              <View
                style={[
                  styles.selectedAvatar,
                  { backgroundColor: selectedEmp.bg || selectedEmp.color + "30" },
                ]}
              >
                <Text
                  style={[styles.selectedAvatarText, { color: selectedEmp.color }]}
                >
                  {getInitials(selectedEmp.name)}
                </Text>
              </View>
              <View>
                <Text style={[styles.selectedName, { color: colors.foreground }]}>
                  {selectedEmp.name}
                </Text>
                <Text
                  style={[
                    styles.selectedRole,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {selectedEmp.role}
                </Text>
              </View>
            </View>
          )}

          <Text style={[styles.pinTitle, { color: colors.foreground }]}>
            {stepTitle}
          </Text>
          {step === "pin_setup" && (
            <Text
              style={[styles.pinHint, { color: colors.mutedForeground }]}
            >
              Установите 4-значный PIN для входа
            </Text>
          )}
          {step === "pin_confirm" && (
            <Text
              style={[styles.pinHint, { color: colors.mutedForeground }]}
            >
              Введите PIN ещё раз для подтверждения
            </Text>
          )}

          <PinDots pin={pin} shake={shakeAnim} />

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <View style={{ height: 20 }} />
          )}

          {busy ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 24 }}
            />
          ) : (
            <Keypad
              onPress={handleKeyPress}
              onDelete={handleDelete}
              disabled={busy}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#1a7a3c",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#1a7a3c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  logoLetter: { fontSize: 26, fontWeight: "700", color: "#fff" },
  logoTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  logoSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 12,
  },

  empGrid: { paddingHorizontal: 16, paddingBottom: 32 },
  empRow: { justifyContent: "space-between", marginBottom: 12 },
  empCard: {
    width: "48%",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    position: "relative",
  },
  avatarText: { fontSize: 22, fontFamily: "Inter_700Bold" },
  colorDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#fff",
  },
  empName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    marginBottom: 4,
  },
  empRole: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  pinContainer: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginBottom: 8,
  },
  backText: { fontSize: 15, fontFamily: "Inter_500Medium" },

  selectedEmpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 28,
    alignSelf: "flex-start",
  },
  selectedAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  selectedName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  selectedRole: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  pinTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
    textAlign: "center",
  },
  pinHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 24,
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
    marginTop: 4,
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
    height: 20,
    textAlign: "center",
  },

  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 280,
    marginTop: 16,
    gap: 12,
  },
  keyBtn: {
    width: 80,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  keyEmpty: { width: 80, height: 64 },
  keyText: { fontSize: 24, fontFamily: "Inter_500Medium" },
});
