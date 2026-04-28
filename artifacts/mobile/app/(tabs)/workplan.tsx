import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/constants/api";
import type { Task, Employee } from "@/types";

const DAYS_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const STATUS_COLORS: Record<string, string> = {
  "Новая": "#1a5fb4",
  "В работе": "#d68910",
  "На проверке": "#6c3483",
  "Выполнена": "#1a7a3c",
  "Заблокирована": "#c0392b",
};
const PRI_COLORS: Record<string, string> = {
  "Высокий": "#c0392b",
  "Средний": "#d68910",
  "Низкий": "#1a7a3c",
};

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function toISO(d: Date) { return d.toISOString().split("T")[0]; }
function fmtShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function fmtDay(d: Date) { return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }

type ViewMode = "day" | "week";

export default function WorkPlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [selectedEmp, setSelectedEmp] = useState<number | null>(null);

  const { data: tasks = [], isLoading: loadTasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => apiGet("/api/tasks"),
    staleTime: 2 * 60 * 1000,
  });
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
    staleTime: 10 * 60 * 1000,
  });

  const empMap = useMemo(() => {
    const m: Record<number, Employee> = {};
    employees.forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const today = toISO(new Date());
  const selDateObj = new Date(selectedDate + "T00:00:00");

  const weekDays = useMemo(() => {
    const dow = selDateObj.getDay();
    const mon = addDays(selDateObj, -dow + 1);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [selectedDate]);

  const filteredTasks = useMemo(() =>
    tasks.filter((t) => {
      if (selectedEmp !== null && t.emp_id !== selectedEmp) return false;
      return true;
    })
  , [tasks, selectedEmp]);

  const getDayTasks = useCallback((iso: string) =>
    filteredTasks.filter((t) => t.due_date === iso)
  , [filteredTasks]);

  const allTasksOnDay = getDayTasks(selectedDate);

  const prev = () => {
    const d = viewMode === "day"
      ? addDays(selDateObj, -1)
      : addDays(selDateObj, -7);
    setSelectedDate(toISO(d));
  };
  const next = () => {
    const d = viewMode === "day"
      ? addDays(selDateObj, 1)
      : addDays(selDateObj, 7);
    setSelectedDate(toISO(d));
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const renderTask = useCallback(({ item: task }: { item: Task }) => {
    const emp = empMap[task.emp_id];
    const priColor = PRI_COLORS[task.priority] || colors.primary;
    const statusColor = STATUS_COLORS[task.status] || colors.mutedForeground;
    return (
      <TouchableOpacity
        style={[styles.taskCard, { backgroundColor: colors.card, borderRadius: colors.radius, borderLeftColor: priColor, borderLeftWidth: 3 }]}
        onPress={() => router.push(`/task/${task.id}`)}
        activeOpacity={0.85}
      >
        <View style={styles.taskTop}>
          <Text style={[styles.taskName, { color: colors.foreground }]} numberOfLines={2}>{task.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{task.status}</Text>
          </View>
        </View>
        <View style={[styles.progBg, { backgroundColor: colors.muted }]}>
          <View style={[styles.progFill, { width: `${task.progress}%` as any, backgroundColor: priColor }]} />
        </View>
        <View style={styles.taskMeta}>
          {emp ? (
            <View style={styles.empRow}>
              <View style={[styles.empDot, { backgroundColor: emp.color || colors.primary }]} />
              <Text style={[styles.empName, { color: colors.mutedForeground }]}>{emp.name}</Text>
            </View>
          ) : <View />}
          <Text style={[styles.priLabel, { color: priColor }]}>{task.priority}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [empMap, colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>График работ</Text>
        <View style={styles.viewToggle}>
          {(["day", "week"] as ViewMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setViewMode(m)}
              style={[styles.toggleBtn, { backgroundColor: viewMode === m ? colors.primary : colors.muted }]}
            >
              <Text style={[styles.toggleText, { color: viewMode === m ? "#fff" : colors.mutedForeground }]}>
                {m === "day" ? "День" : "Неделя"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Employee filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.empFilterScroll, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.empFilterContent}
      >
        <TouchableOpacity
          onPress={() => setSelectedEmp(null)}
          style={[styles.empChip, { backgroundColor: selectedEmp === null ? colors.primary : colors.muted, borderRadius: 100 }]}
        >
          <Text style={[styles.empChipText, { color: selectedEmp === null ? "#fff" : colors.mutedForeground }]}>Все</Text>
        </TouchableOpacity>
        {employees.map((e) => (
          <TouchableOpacity
            key={e.id}
            onPress={() => setSelectedEmp(selectedEmp === e.id ? null : e.id)}
            style={[styles.empChip, { backgroundColor: selectedEmp === e.id ? (e.color || colors.primary) : colors.muted, borderRadius: 100 }]}
          >
            <View style={[styles.empDot, { backgroundColor: selectedEmp === e.id ? "#fff" : (e.color || colors.primary) }]} />
            <Text style={[styles.empChipText, { color: selectedEmp === e.id ? "#fff" : colors.foreground }]} numberOfLines={1}>
              {e.name.split(" ")[0]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Nav */}
      <View style={[styles.navRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={prev} style={styles.navBtn}>
          <Feather name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>
          {viewMode === "day"
            ? `${DAYS_LABELS[selDateObj.getDay()]}, ${fmtDay(selDateObj)}`
            : `${fmtDay(weekDays[0])} — ${fmtDay(weekDays[6])}`}
        </Text>
        <TouchableOpacity onPress={next} style={styles.navBtn}>
          <Feather name="chevron-right" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSelectedDate(today)}
          style={[styles.todayBtn, { backgroundColor: selectedDate === today ? colors.primary : colors.muted }]}
        >
          <Text style={[styles.todayText, { color: selectedDate === today ? "#fff" : colors.foreground }]}>Сегодня</Text>
        </TouchableOpacity>
      </View>

      {loadTasks ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : viewMode === "week" ? (
        /* Week view */
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {weekDays.map((day) => {
            const iso = toISO(day);
            const dayTasks = getDayTasks(iso);
            const isToday = iso === today;
            const isSelected = iso === selectedDate;
            return (
              <TouchableOpacity
                key={iso}
                onPress={() => { setSelectedDate(iso); setViewMode("day"); }}
                activeOpacity={0.85}
              >
                <View style={[styles.weekRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.weekDayCol, { backgroundColor: isToday ? colors.primary : isSelected ? colors.primary + "15" : "transparent" }]}>
                    <Text style={[styles.weekDayName, { color: isToday ? "#fff" : colors.mutedForeground }]}>{DAYS_LABELS[day.getDay()]}</Text>
                    <Text style={[styles.weekDayNum, { color: isToday ? "#fff" : colors.foreground }]}>{day.getDate()}</Text>
                    {dayTasks.length > 0 && (
                      <View style={[styles.weekDotBadge, { backgroundColor: isToday ? "rgba(255,255,255,0.5)" : colors.primary + "30" }]}>
                        <Text style={[styles.weekDotBadgeText, { color: isToday ? "#fff" : colors.primary }]}>{dayTasks.length}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.weekTasksCol}>
                    {dayTasks.length === 0 ? (
                      <Text style={[styles.noTasks, { color: colors.mutedForeground }]}>Нет задач</Text>
                    ) : (
                      dayTasks.slice(0, 3).map((t) => {
                        const priColor = PRI_COLORS[t.priority] || colors.primary;
                        return (
                          <View key={t.id} style={[styles.weekTaskChip, { backgroundColor: priColor + "15", borderLeftColor: priColor, borderLeftWidth: 2 }]}>
                            <Text style={[styles.weekTaskName, { color: colors.foreground }]} numberOfLines={1}>{t.name}</Text>
                            {empMap[t.emp_id] && (
                              <Text style={[styles.weekTaskEmp, { color: colors.mutedForeground }]}>{empMap[t.emp_id].name.split(" ")[0]}</Text>
                            )}
                          </View>
                        );
                      })
                    )}
                    {dayTasks.length > 3 && (
                      <Text style={[styles.moreText, { color: colors.primary }]}>+{dayTasks.length - 3} ещё</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        /* Day view */
        <View style={{ flex: 1 }}>
          {allTasksOnDay.length === 0 ? (
            <View style={styles.emptyDay}>
              <Feather name="calendar" size={40} color={colors.muted} />
              <Text style={[styles.emptyDayText, { color: colors.mutedForeground }]}>Нет задач на этот день</Text>
              <TouchableOpacity
                style={[styles.createBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/(tabs)/tasks")}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.createBtnText}>Создать задачу</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={allTasksOnDay}
              renderItem={renderTask}
              keyExtractor={(t) => String(t.id)}
              contentContainerStyle={styles.dayList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
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
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  viewToggle: { flexDirection: "row", gap: 6 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  toggleText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  empFilterScroll: { flexGrow: 0, borderBottomWidth: 1 },
  empFilterContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: "row" },
  empChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 5, gap: 5 },
  empChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  empDot: { width: 7, height: 7, borderRadius: 4 },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  navBtn: { padding: 6 },
  navTitle: { flex: 1, textAlign: "center", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  todayText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  weekRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    minHeight: 62,
  },
  weekDayCol: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 2,
  },
  weekDayName: { fontSize: 10, fontFamily: "Inter_500Medium" },
  weekDayNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  weekDotBadge: { borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1 },
  weekDotBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  weekTasksCol: { flex: 1, padding: 8, gap: 4, justifyContent: "center" },
  weekTaskChip: { padding: 5, borderRadius: 5, paddingLeft: 7 },
  weekTaskName: { fontSize: 12, fontFamily: "Inter_500Medium" },
  weekTaskEmp: { fontSize: 10, fontFamily: "Inter_400Regular" },
  noTasks: { fontSize: 12, fontFamily: "Inter_400Regular" },
  moreText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  dayList: { padding: 12, gap: 10, paddingBottom: 100 },
  taskCard: {
    padding: 13,
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  taskTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  taskName: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  progBg: { height: 3, borderRadius: 2, overflow: "hidden" },
  progFill: { height: 3, borderRadius: 2 },
  taskMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  empRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  empName: { fontSize: 12, fontFamily: "Inter_400Regular" },
  priLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyDay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40 },
  emptyDayText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  createBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
