import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Platform } from "react-native";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/constants/api";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionHeader } from "@/components/SectionHeader";
import type { Stats, Task, Employee } from "@/types";

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: () => apiGet("/api/stats"),
  });

  const { data: tasks, isLoading: tasksLoading, refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => apiGet("/api/tasks"),
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
  });

  const isRefreshing = false;
  const onRefresh = async () => {
    await Promise.all([refetchStats(), refetchTasks()]);
  };

  const empMap = React.useMemo(() => {
    const m: Record<number, Employee> = {};
    (employees || []).forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const recentTasks = (tasks || [])
    .filter((t) => t.status !== "Выполнена")
    .slice(0, 5);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: 100 }}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            Добро пожаловать
          </Text>
          <Text style={[styles.brand, { color: colors.primary }]}>
            Пойтахт
          </Text>
        </View>
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.primary },
          ]}
        >
          <Text style={styles.avatarText}>П</Text>
        </View>
      </View>

      {statsLoading ? (
        <ActivityIndicator
          color={colors.primary}
          style={{ marginVertical: 24 }}
        />
      ) : (
        <>
          <View style={styles.statsGrid}>
            <StatCard
              label="Задач всего"
              value={stats?.tasks?.total ?? 0}
              color={colors.primary}
            />
            <StatCard
              label="Выполнено"
              value={stats?.tasks?.done ?? 0}
              color={colors.success}
            />
            <StatCard
              label="Просрочено"
              value={stats?.tasks?.overdue ?? 0}
              color={colors.danger}
            />
            <StatCard
              label="В работе"
              value={stats?.tasks?.wip ?? 0}
              color={colors.warning}
            />
          </View>

          <View style={[styles.statsGrid, { marginTop: 0 }]}>
            <StatCard
              label="На работе сегодня"
              value={(stats?.attendance?.present ?? 0) + (stats?.attendance?.late ?? 0)}
              color={colors.info}
              small
            />
            <StatCard
              label="Дебиторов (критич.)"
              value={stats?.debtors?.critical ?? 0}
              color={colors.danger}
              small
            />
            <StatCard
              label="Склад (тревоги)"
              value={(stats?.warehouse?.out_of_stock ?? 0) + (stats?.warehouse?.low_stock ?? 0)}
              color={colors.warning}
              small
            />
          </View>
        </>
      )}

      <SectionHeader
        title="Активные задачи"
        action="Все"
        onAction={() => router.push("/(tabs)/tasks")}
      />

      {tasksLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : (
        <View style={{ paddingHorizontal: 12 }}>
          {recentTasks.map((task) => {
            const emp = empMap[task.emp_id];
            return (
              <TouchableOpacity
                key={task.id}
                style={[
                  styles.taskCard,
                  {
                    backgroundColor: colors.card,
                    borderRadius: colors.radius,
                    shadowColor: colors.shadow,
                  },
                ]}
                onPress={() => router.push(`/task/${task.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.taskTop}>
                  <Text
                    style={[styles.taskName, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {task.name}
                  </Text>
                  <StatusBadge status={task.priority} />
                </View>
                <View style={styles.taskBottom}>
                  {emp && (
                    <View style={styles.empRow}>
                      <View
                        style={[styles.empDot, { backgroundColor: emp.color }]}
                      />
                      <Text
                        style={[
                          styles.empName,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {emp.name}
                      </Text>
                    </View>
                  )}
                  <StatusBadge status={task.status} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  brand: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  taskCard: {
    padding: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  taskTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  taskName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  taskBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  empRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  empDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  empName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
