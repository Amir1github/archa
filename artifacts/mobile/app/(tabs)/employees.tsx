import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/constants/api";
import { EmptyState } from "@/components/EmptyState";
import type { Employee } from "@/types";

export default function EmployeesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: employees, isLoading, refetch } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;

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
          Сотрудники
        </Text>
        <View
          style={[
            styles.countPill,
            { backgroundColor: colors.primary + "20", borderRadius: colors.radius },
          ]}
        >
          <Text style={[styles.countText, { color: colors.primary }]}>
            {(employees || []).length}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (employees || []).length === 0 ? (
        <EmptyState icon="users" title="Нет сотрудников" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} />
          }
          showsVerticalScrollIndicator={false}
        >
          {(employees || []).map((emp) => (
            <View
              key={emp.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderRadius: colors.radius,
                  shadowColor: colors.shadow,
                },
              ]}
            >
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
                <View style={styles.empTopRow}>
                  <Text style={[styles.empName, { color: colors.foreground }]}>
                    {emp.name}
                  </Text>
                  <View style={styles.badges}>
                    {emp.is_admin === 1 && (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: colors.primary + "20" },
                        ]}
                      >
                        <Text
                          style={[styles.badgeText, { color: colors.primary }]}
                        >
                          Админ
                        </Text>
                      </View>
                    )}
                    {emp.is_hr === 1 && (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: colors.accent + "20" },
                        ]}
                      >
                        <Text
                          style={[styles.badgeText, { color: colors.accent }]}
                        >
                          HR
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={[styles.empRole, { color: colors.mutedForeground }]}>
                  {emp.role}
                </Text>
                <View style={styles.empMeta}>
                  <Feather name="dollar-sign" size={12} color={colors.success} />
                  <Text style={[styles.salaryText, { color: colors.mutedForeground }]}>
                    {emp.salary.toLocaleString()} сум/мес
                  </Text>
                </View>
              </View>
            </View>
          ))}
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
  countPill: { paddingHorizontal: 12, paddingVertical: 6 },
  countText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  list: { padding: 12, gap: 10, paddingBottom: 100 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 22, fontFamily: "Inter_700Bold" },
  empInfo: { flex: 1, gap: 4 },
  empTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  empName: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  empRole: { fontSize: 13, fontFamily: "Inter_400Regular" },
  empMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  salaryText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badges: { flexDirection: "row", gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
