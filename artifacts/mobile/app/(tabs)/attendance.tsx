import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/constants/api";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import type { Attendance, Employee } from "@/types";

function getTodayISO() {
  return new Date().toISOString().split("T")[0];
}

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(getTodayISO());

  const { data: attendance, isLoading, refetch } = useQuery<Attendance[]>({
    queryKey: ["attendance", date],
    queryFn: () => apiGet(`/api/attendance?date=${date}`),
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
  });

  const empMap = React.useMemo(() => {
    const m: Record<number, Employee> = {};
    (employees || []).forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const presentCount = (attendance || []).filter(
    (a) => a.status === "present" || a.status === "late" || a.status === "early_out"
  ).length;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const prevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split("T")[0]);
  };
  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    if (d <= new Date()) setDate(d.toISOString().split("T")[0]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Посещаемость
        </Text>
        <View style={[styles.datePill, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
          <Text style={[styles.presentCount, { color: colors.primary }]}>
            {presentCount}/{(employees || []).length}
          </Text>
          <Text style={[styles.presentLabel, { color: colors.mutedForeground }]}>
            {" "}на работе
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.dateNav,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={prevDay} style={styles.navBtn}>
          <Feather name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.dateText, { color: colors.foreground }]}>
          {new Date(date).toLocaleDateString("ru-RU", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </Text>
        <TouchableOpacity onPress={nextDay} style={styles.navBtn}>
          <Feather
            name="chevron-right"
            size={22}
            color={
              new Date(date).toDateString() === new Date().toDateString()
                ? colors.border
                : colors.primary
            }
          />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (attendance || []).length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Нет данных"
          subtitle="Данные о посещаемости за этот день отсутствуют"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} />
          }
          showsVerticalScrollIndicator={false}
        >
          {(attendance || []).map((att) => {
            const emp = empMap[att.emp_id];
            if (!emp) return null;
            return (
              <View
                key={att.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderRadius: colors.radius,
                    shadowColor: colors.shadow,
                  },
                ]}
              >
                <View style={styles.cardLeft}>
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: emp.bg || colors.muted },
                    ]}
                  >
                    <Text style={[styles.avatarText, { color: emp.color }]}>
                      {emp.name.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.empInfo}>
                    <Text style={[styles.empName, { color: colors.foreground }]}>
                      {emp.name}
                    </Text>
                    <Text style={[styles.empRole, { color: colors.mutedForeground }]}>
                      {emp.role}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <StatusBadge status={att.status} />
                  {att.time_in && (
                    <View style={styles.timeRow}>
                      <Feather
                        name="log-in"
                        size={12}
                        color={colors.success}
                      />
                      <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
                        {att.time_in}
                      </Text>
                      {att.time_out && (
                        <>
                          <Feather
                            name="log-out"
                            size={12}
                            color={colors.danger}
                          />
                          <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
                            {att.time_out}
                          </Text>
                        </>
                      )}
                    </View>
                  )}
                  {att.late_min > 0 && (
                    <Text style={[styles.lateText, { color: colors.danger }]}>
                      +{att.late_min} мин.
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  presentCount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  presentLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  navBtn: { padding: 6 },
  dateText: { fontSize: 15, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  list: { padding: 12, gap: 8, paddingBottom: 100 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    justifyContent: "space-between",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  empInfo: { flex: 1 },
  empName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  empRole: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardRight: { alignItems: "flex-end", gap: 4 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  lateText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
