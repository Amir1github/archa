import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost } from "@/constants/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { EmptyState } from "@/components/EmptyState";
import type { Task, Employee } from "@/types";

const FILTERS = ["Все", "Новая", "В работе", "На проверке", "Выполнена", "Заблокирована"];

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("Все");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: tasks, isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => apiGet("/api/tasks"),
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

  const filtered = (tasks || []).filter((t) => {
    if (filter !== "Все" && t.status !== filter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const createTask = async () => {
    if (!newTaskName.trim()) return;
    setCreating(true);
    try {
      await apiPost("/api/tasks", {
        name: newTaskName.trim(),
        description: newTaskDesc.trim(),
        emp_id: 1,
        priority: "Средний",
        category: "Прочее",
        status: "Новая",
        progress: 0,
      });
      setNewTaskName("");
      setNewTaskDesc("");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Задачи</Text>
        <TouchableOpacity
          onPress={() => setShowForm(!showForm)}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name={showForm ? "x" : "plus"} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {showForm && (
        <View
          style={[
            styles.formCard,
            {
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
              borderBottomWidth: 1,
            },
          ]}
        >
          <TextInput
            placeholder="Название задачи"
            placeholderTextColor={colors.mutedForeground}
            value={newTaskName}
            onChangeText={setNewTaskName}
            style={[
              styles.input,
              {
                backgroundColor: colors.muted,
                borderRadius: colors.radius / 2,
                color: colors.foreground,
              },
            ]}
          />
          <TextInput
            placeholder="Описание (необязательно)"
            placeholderTextColor={colors.mutedForeground}
            value={newTaskDesc}
            onChangeText={setNewTaskDesc}
            style={[
              styles.input,
              {
                backgroundColor: colors.muted,
                borderRadius: colors.radius / 2,
                color: colors.foreground,
              },
            ]}
          />
          <TouchableOpacity
            onPress={createTask}
            disabled={creating || !newTaskName.trim()}
            style={[
              styles.createBtn,
              {
                backgroundColor: creating || !newTaskName.trim() ? colors.border : colors.primary,
                borderRadius: colors.radius / 2,
              },
            ]}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.createBtnText}>Создать</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View
        style={[
          styles.searchRow,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.muted,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            placeholder="Поиск задач..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterScroll, { backgroundColor: colors.card }]}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f ? colors.primary : colors.muted,
                borderRadius: 100,
              },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? "#fff" : colors.mutedForeground },
              ]}
            >
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="check-square" title="Нет задач" subtitle="Задачи не найдены" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} />
          }
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((task) => {
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
                <View style={styles.taskHeader}>
                  <Text
                    style={[styles.taskName, { color: colors.foreground }]}
                    numberOfLines={2}
                  >
                    {task.name}
                  </Text>
                  <StatusBadge status={task.priority} />
                </View>

                {task.description ? (
                  <Text
                    style={[styles.taskDesc, { color: colors.mutedForeground }]}
                    numberOfLines={2}
                  >
                    {task.description}
                  </Text>
                ) : null}

                <ProgressBar progress={task.progress} />

                <View style={styles.taskFooter}>
                  {emp && (
                    <View style={styles.empRow}>
                      <View
                        style={[styles.empDot, { backgroundColor: emp.color }]}
                      />
                      <Text
                        style={[styles.empName, { color: colors.mutedForeground }]}
                      >
                        {emp.name}
                      </Text>
                    </View>
                  )}
                  <View style={styles.footerRight}>
                    {task.due_date && (
                      <Text style={[styles.dueDate, { color: colors.mutedForeground }]}>
                        {task.due_date}
                      </Text>
                    )}
                    <StatusBadge status={task.status} />
                  </View>
                </View>
              </TouchableOpacity>
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  formCard: { padding: 16, gap: 10 },
  input: { padding: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  createBtn: {
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  searchRow: {
    padding: 12,
    borderBottomWidth: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  filterScroll: { flexGrow: 0, borderBottomWidth: 1 },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6 },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { padding: 12, gap: 10, paddingBottom: 100 },
  taskCard: {
    padding: 14,
    gap: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  taskHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  taskName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  taskDesc: { fontSize: 13, fontFamily: "Inter_400Regular" },
  taskFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  empRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  empDot: { width: 8, height: 8, borderRadius: 4 },
  empName: { fontSize: 12, fontFamily: "Inter_400Regular" },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  dueDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
