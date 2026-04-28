import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/constants/api";
import { StatusBadge } from "@/components/StatusBadge";
import type { Stats, Task, Employee } from "@/types";

interface Debtor { id: number; name: string; debt: number; overdue_days: number; status: string; }

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}К`;
  return String(n);
}

function getHour() { return new Date().getHours(); }
function getGreeting() {
  const h = getHour();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 17) return "Добрый день";
  return "Добрый вечер";
}
function fmtDate(d: string) {
  const dt = new Date(d);
  return `${dt.getDate()} ${["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"][dt.getMonth()]}`;
}

function AlertBanner({ alerts, colors }: { alerts: { icon: string; text: string; color: string }[]; colors: any }) {
  const [idx, setIdx] = useState(0);
  if (!alerts.length) return null;
  const a = alerts[idx % alerts.length];
  return (
    <TouchableOpacity
      style={[styles.alertBanner, { backgroundColor: a.color + "15", borderColor: a.color + "40" }]}
      onPress={() => setIdx((i) => (i + 1) % alerts.length)}
      activeOpacity={0.85}
    >
      <Feather name={a.icon as any} size={15} color={a.color} />
      <Text style={[styles.alertText, { color: a.color }]} numberOfLines={1}>{a.text}</Text>
      {alerts.length > 1 && (
        <View style={[styles.alertDots]}>
          {alerts.map((_, i) => (
            <View key={i} style={[styles.alertDot, { backgroundColor: i === idx % alerts.length ? a.color : a.color + "40" }]} />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function KpiCard({ icon, label, value, sub, color, onPress }: {
  icon: string; label: string; value: string; sub?: string; color: string; onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.kpiCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
    >
      <View style={[styles.kpiIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {sub ? <Text style={[styles.kpiSub, { color: color }]}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: () => apiGet("/api/stats"),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const { data: tasks = [], isLoading: tasksLoading, refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => apiGet("/api/tasks"),
    staleTime: 2 * 60 * 1000,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: debtors = [] } = useQuery<Debtor[]>({
    queryKey: ["debtors"],
    queryFn: () => apiGet("/api/debtors"),
    staleTime: 5 * 60 * 1000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchTasks()]);
    setRefreshing(false);
  };

  const empMap = useMemo(() => {
    const m: Record<number, Employee> = {};
    employees.forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const overdueTasks = useMemo(() =>
    tasks.filter((t) => t.status !== "Выполнена" && t.due_date && t.due_date < new Date().toISOString().split("T")[0])
  , [tasks]);

  const wipTasks = useMemo(() =>
    tasks.filter((t) => t.status === "В работе").slice(0, 4)
  , [tasks]);

  const topDebtors = useMemo(() =>
    [...debtors].filter((d) => d.status !== "paid").sort((a, b) => b.debt - a.debt).slice(0, 3)
  , [debtors]);

  const taskPct = stats?.tasks?.total
    ? Math.round((stats.tasks.done / stats.tasks.total) * 100)
    : 0;

  const attPct = stats?.attendance?.total
    ? Math.round((stats.attendance.present / stats.attendance.total) * 100)
    : 0;

  const alerts = useMemo(() => {
    const a: { icon: string; text: string; color: string }[] = [];
    if ((stats?.tasks?.overdue || 0) > 0)
      a.push({ icon: "alert-circle", text: `${stats!.tasks.overdue} задач просрочено`, color: colors.danger });
    if ((stats?.debtors?.critical || 0) > 0)
      a.push({ icon: "trending-down", text: `${stats!.debtors.critical} критических долгов (>90 дней)`, color: colors.danger });
    if ((stats?.warehouse?.out_of_stock || 0) > 0)
      a.push({ icon: "package", text: `${stats!.warehouse.out_of_stock} позиций отсутствуют на складе`, color: colors.warning });
    if ((stats?.warehouse?.low_stock || 0) > 0)
      a.push({ icon: "alert-triangle", text: `${stats!.warehouse.low_stock} позиций — мало на складе`, color: colors.warning });
    if ((stats?.debtors?.no_comment || 0) > 0)
      a.push({ icon: "message-circle", text: `${stats!.debtors.no_comment} должников без ответа 7+ дней`, color: "#8e44ad" });
    return a;
  }, [stats, colors]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const today = new Date().toISOString().split("T")[0];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroGreeting}>{getGreeting()}</Text>
            <Text style={styles.heroBrand}>Пойтахт</Text>
            <Text style={styles.heroDate}>{fmtDate(today)}</Text>
          </View>
          <View style={styles.heroScore}>
            <Text style={styles.heroScoreNum}>{taskPct}</Text>
            <Text style={styles.heroScoreLabel}>% задач</Text>
          </View>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatVal}>{stats?.tasks?.total ?? "—"}</Text>
            <Text style={styles.heroStatLabel}>задач</Text>
          </View>
          <View style={[styles.heroStatDiv, { backgroundColor: "rgba(255,255,255,0.3)" }]} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatVal}>{stats?.attendance?.present ?? "—"}/{stats?.attendance?.total ?? "—"}</Text>
            <Text style={styles.heroStatLabel}>на работе</Text>
          </View>
          <View style={[styles.heroStatDiv, { backgroundColor: "rgba(255,255,255,0.3)" }]} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatVal}>{fmt(stats?.debtors?.total_debt ?? 0)}</Text>
            <Text style={styles.heroStatLabel}>дебиторка</Text>
          </View>
        </View>
      </View>

      {/* Alerts */}
      {!statsLoading && alerts.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <AlertBanner alerts={alerts} colors={colors} />
        </View>
      )}

      {/* KPI Grid */}
      {statsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
      ) : (
        <View style={styles.kpiGrid}>
          <KpiCard
            icon="check-square"
            label="Выполнение задач"
            value={`${taskPct}%`}
            sub={`${stats?.tasks?.done ?? 0} из ${stats?.tasks?.total ?? 0}`}
            color={taskPct >= 80 ? colors.success : taskPct >= 50 ? colors.warning : colors.danger}
            onPress={() => router.push("/(tabs)/tasks")}
          />
          <KpiCard
            icon="users"
            label="Явка сегодня"
            value={`${attPct}%`}
            sub={stats?.attendance?.late ? `${stats.attendance.late} опоздали` : undefined}
            color={attPct >= 90 ? colors.success : attPct >= 70 ? colors.warning : colors.danger}
            onPress={() => router.push("/(tabs)/attendance")}
          />
          <KpiCard
            icon="alert-circle"
            label="Просроченные"
            value={String(stats?.tasks?.overdue ?? 0)}
            sub="задач"
            color={(stats?.tasks?.overdue ?? 0) > 0 ? colors.danger : colors.success}
            onPress={() => router.push("/(tabs)/tasks")}
          />
          <KpiCard
            icon="dollar-sign"
            label="Дебиторы"
            value={fmt(stats?.debtors?.total_debt ?? 0)}
            sub={`${stats?.debtors?.critical ?? 0} крит.`}
            color={(stats?.debtors?.critical ?? 0) > 0 ? colors.danger : colors.success}
            onPress={() => router.push("/(tabs)/debtors")}
          />
        </View>
      )}

      {/* In Progress Tasks */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>В работе</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/tasks")}>
            <Text style={[styles.sectionLink, { color: colors.primary }]}>Все →</Text>
          </TouchableOpacity>
        </View>
        {tasksLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : wipTasks.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Нет активных задач</Text>
        ) : (
          wipTasks.map((task) => {
            const emp = empMap[task.emp_id];
            const isOverdue = task.due_date && task.due_date < today;
            return (
              <TouchableOpacity
                key={task.id}
                style={[styles.taskCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}
                onPress={() => router.push(`/task/${task.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.taskRow}>
                  <View style={[styles.taskPriDot, { backgroundColor: task.priority === "Высокий" ? colors.danger : task.priority === "Средний" ? colors.warning : colors.success }]} />
                  <Text style={[styles.taskName, { color: colors.foreground }]} numberOfLines={1}>{task.name}</Text>
                  <StatusBadge status={task.priority} />
                </View>
                <View style={[styles.tProgBg, { backgroundColor: colors.muted }]}>
                  <View style={[styles.tProgFill, { width: `${task.progress}%` as any, backgroundColor: colors.primary }]} />
                </View>
                <View style={styles.taskMeta}>
                  {emp && <Text style={[styles.taskEmp, { color: colors.mutedForeground }]}>{emp.name}</Text>}
                  {task.due_date && (
                    <Text style={[styles.taskDue, { color: isOverdue ? colors.danger : colors.mutedForeground }]}>
                      {isOverdue ? "⚠ " : ""}{task.due_date}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Overdue Tasks Alert */}
      {overdueTasks.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionTitleRow}>
              <Feather name="alert-circle" size={15} color={colors.danger} />
              <Text style={[styles.sectionTitle, { color: colors.danger }]}>Просрочено ({overdueTasks.length})</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/(tabs)/tasks")}>
              <Text style={[styles.sectionLink, { color: colors.primary }]}>Все →</Text>
            </TouchableOpacity>
          </View>
          {overdueTasks.slice(0, 3).map((task) => {
            const emp = empMap[task.emp_id];
            const daysOverdue = task.due_date ? Math.floor((Date.now() - new Date(task.due_date).getTime()) / 86400000) : 0;
            return (
              <TouchableOpacity
                key={task.id}
                style={[styles.taskCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow, borderLeftColor: colors.danger, borderLeftWidth: 3 }]}
                onPress={() => router.push(`/task/${task.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.taskRow}>
                  <Text style={[styles.taskName, { color: colors.foreground }]} numberOfLines={1}>{task.name}</Text>
                  <Text style={[styles.overdueTag, { backgroundColor: colors.danger + "15", color: colors.danger }]}>+{daysOverdue}д</Text>
                </View>
                {emp && <Text style={[styles.taskEmp, { color: colors.mutedForeground }]}>{emp.name}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Top Debtors */}
      {topDebtors.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Топ должников</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/debtors")}>
              <Text style={[styles.sectionLink, { color: colors.primary }]}>Все →</Text>
            </TouchableOpacity>
          </View>
          {topDebtors.map((d, i) => (
            <View key={d.id} style={[styles.debtorRow, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
              <View style={[styles.debtorRank, { backgroundColor: i === 0 ? colors.danger + "15" : colors.muted }]}>
                <Text style={[styles.debtorRankText, { color: i === 0 ? colors.danger : colors.mutedForeground }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.debtorName, { color: colors.foreground }]} numberOfLines={1}>{d.name}</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.debtorAmt, { color: d.overdue_days > 90 ? colors.danger : colors.warning }]}>{fmt(d.debt)}</Text>
                <Text style={[styles.debtorDays, { color: colors.mutedForeground }]}>{d.overdue_days}д</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Quick Nav */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 10 }]}>Быстрый доступ</Text>
        <View style={styles.quickGrid}>
          {[
            { icon: "check-square", label: "Задачи", route: "/(tabs)/tasks", color: colors.primary },
            { icon: "users", label: "HR", route: "/(tabs)/attendance", color: "#6c3483" },
            { icon: "dollar-sign", label: "Дебиторы", route: "/(tabs)/debtors", color: colors.danger },
            { icon: "trending-up", label: "Продажи", route: "/(tabs)/sales", color: colors.success },
            { icon: "package", label: "Склад", route: "/(tabs)/warehouse", color: "#d68910" },
            { icon: "cpu", label: "AI Агент", route: "/(tabs)/ai-chat", color: "#2980b9" },
          ].map((item) => (
            <TouchableOpacity
              key={item.route}
              style={[styles.quickCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.quickIcon, { backgroundColor: item.color + "15" }]}>
                <Feather name={item.icon as any} size={20} color={item.color} />
              </View>
              <Text style={[styles.quickLabel, { color: colors.foreground }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  heroGreeting: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_400Regular" },
  heroBrand: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold", marginTop: 2 },
  heroDate: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  heroScore: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 12, minWidth: 70 },
  heroScoreNum: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  heroScoreLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular" },
  heroStats: { flexDirection: "row", alignItems: "center", gap: 0 },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatVal: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  heroStatLabel: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "Inter_400Regular" },
  heroStatDiv: { width: 1, height: 28, marginHorizontal: 4 },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  alertText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  alertDots: { flexDirection: "row", gap: 4 },
  alertDot: { width: 6, height: 6, borderRadius: 3 },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingTop: 14,
    gap: 10,
  },
  kpiCard: {
    width: "47%",
    padding: 14,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    gap: 4,
  },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  kpiValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  kpiLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  kpiSub: { fontSize: 11, fontFamily: "Inter_500Medium" },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sectionLink: { fontSize: 14, fontFamily: "Inter_500Medium" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 12 },
  taskCard: {
    padding: 12,
    marginBottom: 8,
    gap: 7,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  taskPriDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  taskName: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tProgBg: { height: 3, borderRadius: 2, overflow: "hidden" },
  tProgFill: { height: 3, borderRadius: 2 },
  taskMeta: { flexDirection: "row", justifyContent: "space-between" },
  taskEmp: { fontSize: 12, fontFamily: "Inter_400Regular" },
  taskDue: { fontSize: 12, fontFamily: "Inter_400Regular" },
  overdueTag: { fontSize: 11, fontFamily: "Inter_700Bold", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  debtorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 6,
  },
  debtorRank: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  debtorRankText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  debtorName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  debtorAmt: { fontSize: 14, fontFamily: "Inter_700Bold" },
  debtorDays: { fontSize: 11, fontFamily: "Inter_400Regular" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: {
    width: "30%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quickIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
});
