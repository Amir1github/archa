import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Platform,
  Modal,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet, apiPost } from "@/constants/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { EmptyState } from "@/components/EmptyState";
import type { Task, Employee } from "@/types";

const FILTERS = ["Все", "Новая", "В работе", "На проверке", "Выполнена", "Заблокирована"];
const STATUSES = ["Новая", "В работе", "На проверке", "Выполнена", "Заблокирована"];
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

function fmtDate(d: string | null) {
  if (!d) return "";
  const parts = d.split("-");
  return `${parts[2]}.${parts[1]}`;
}

function TaskCardItem({ task, emp, colors, onPress }: { task: Task; emp?: Employee; colors: any; onPress: () => void }) {
  const priColor = PRI_COLORS[task.priority] || colors.mutedForeground;
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().split("T")[0] && task.status !== "Выполнена";
  return (
    <TouchableOpacity
      style={[styles.taskCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow, borderLeftColor: priColor, borderLeftWidth: 3 }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.taskHeader}>
        <Text style={[styles.taskName, { color: colors.foreground }]} numberOfLines={2}>{task.name}</Text>
        <StatusBadge status={task.priority} />
      </View>
      {task.description ? (
        <Text style={[styles.taskDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{task.description}</Text>
      ) : null}
      <ProgressBar progress={task.progress} />
      <View style={styles.taskFooter}>
        {emp ? (
          <View style={styles.empRow}>
            <View style={[styles.empDot, { backgroundColor: emp.color || colors.primary }]} />
            <Text style={[styles.empName, { color: colors.mutedForeground }]}>{emp.name}</Text>
          </View>
        ) : <View />}
        <View style={styles.footerRight}>
          {task.due_date ? (
            <Text style={[styles.dueDate, { color: isOverdue ? colors.danger : colors.mutedForeground }]}>{fmtDate(task.due_date)}</Text>
          ) : null}
          <StatusBadge status={task.status} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const MemoTaskCard = React.memo(TaskCardItem);

function KanbanColumn({ status, tasks, empMap, colors, onPress }: { status: string; tasks: Task[]; empMap: Record<number, Employee>; colors: any; onPress: (id: number) => void }) {
  const col = STATUS_COLORS[status] || colors.mutedForeground;
  return (
    <View style={[styles.kanbanCol, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
      <View style={[styles.kanbanHeader, { borderBottomColor: colors.border }]}>
        <View style={[styles.kanbanDot, { backgroundColor: col }]} />
        <Text style={[styles.kanbanTitle, { color: colors.foreground }]}>{status}</Text>
        <View style={[styles.kanbanCount, { backgroundColor: col + "20" }]}>
          <Text style={[styles.kanbanCountText, { color: col }]}>{tasks.length}</Text>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {tasks.map((t) => {
          const priColor = PRI_COLORS[t.priority] || colors.mutedForeground;
          const emp = empMap[t.emp_id];
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.kanbanCard, { backgroundColor: colors.background, borderRadius: colors.radius / 1.5, borderLeftColor: priColor, borderLeftWidth: 2 }]}
              onPress={() => onPress(t.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.kanbanCardName, { color: colors.foreground }]} numberOfLines={2}>{t.name}</Text>
              <View style={{ marginVertical: 5 }}>
                <View style={[styles.kProgBg, { backgroundColor: colors.muted }]}>
                  <View style={[styles.kProgFill, { width: `${t.progress}%` as any, backgroundColor: priColor }]} />
                </View>
              </View>
              <View style={styles.kanbanMeta}>
                {emp ? <Text style={[styles.kanbanEmp, { color: colors.mutedForeground }]}>{emp.name.split(" ")[0]}</Text> : null}
                {t.due_date ? <Text style={[styles.kanbanDue, { color: colors.mutedForeground }]}>{fmtDate(t.due_date)}</Text> : null}
              </View>
            </TouchableOpacity>
          );
        })}
        {tasks.length === 0 && (
          <View style={styles.emptyCol}>
            <Text style={[styles.emptyColText, { color: colors.mutedForeground }]}>Нет задач</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const MemoKanbanColumn = React.memo(KanbanColumn);

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = useState("Все");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [showForm, setShowForm] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: tasks, isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => apiGet("/api/tasks"),
    staleTime: 2 * 60 * 1000,
  });
  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
    staleTime: 10 * 60 * 1000,
  });

  const empMap = useMemo(() => {
    const m: Record<number, Employee> = {};
    (employees || []).forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const filtered = useMemo(() => (tasks || []).filter((t) => {
    if (filter !== "Все" && t.status !== filter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [tasks, filter, search]);

  const kanbanGroups = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    STATUSES.forEach((s) => { groups[s] = []; });
    (tasks || []).forEach((t) => { if (groups[t.status]) groups[t.status].push(t); });
    return groups;
  }, [tasks]);

  const handlePress = useCallback((id: number) => { router.push(`/task/${id}`); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const createTask = async () => {
    if (!newTaskName.trim()) return;
    if (!selectedEmpId) return;
    setCreating(true);
    try {
      await apiPost("/api/tasks", {
        name: newTaskName.trim(),
        description: newTaskDesc.trim(),
        emp_id: selectedEmpId,
        priority: "Средний",
        category: "Прочее",
        status: "Новая",
        progress: 0,
      });
      setNewTaskName("");
      setNewTaskDesc("");
      setSelectedEmpId(null);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch {
    } finally {
      setCreating(false);
    }
  };

  const renderItem = useCallback(({ item }: { item: Task }) => (
    <MemoTaskCard
      task={item}
      emp={empMap[item.emp_id]}
      colors={colors}
      onPress={() => handlePress(item.id)}
    />
  ), [empMap, colors, handlePress]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Задачи</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setViewMode(viewMode === "list" ? "kanban" : "list")}
            style={[styles.iconBtn, { backgroundColor: viewMode === "kanban" ? colors.primary + "20" : colors.muted }]}
          >
            <Feather name={viewMode === "list" ? "columns" : "list"} size={18} color={viewMode === "kanban" ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setShowForm(!showForm);
              if (showForm) { setNewTaskName(""); setNewTaskDesc(""); setSelectedEmpId(null); }
            }}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name={showForm ? "x" : "plus"} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {showForm && (
        <View style={[styles.formCard, { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
          <TextInput
            placeholder="Название задачи"
            placeholderTextColor={colors.mutedForeground}
            value={newTaskName}
            onChangeText={setNewTaskName}
            style={[styles.input, { backgroundColor: colors.muted, borderRadius: colors.radius / 2, color: colors.foreground }]}
          />
          <TextInput
            placeholder="Описание (необязательно)"
            placeholderTextColor={colors.mutedForeground}
            value={newTaskDesc}
            onChangeText={setNewTaskDesc}
            style={[styles.input, { backgroundColor: colors.muted, borderRadius: colors.radius / 2, color: colors.foreground }]}
          />
          {/* Выбор исполнителя */}
          <TouchableOpacity
            onPress={() => setShowEmpPicker(true)}
            style={[styles.empPickerBtn, {
              backgroundColor: colors.muted,
              borderRadius: colors.radius / 2,
              borderWidth: selectedEmpId ? 1.5 : 0,
              borderColor: selectedEmpId ? colors.primary : "transparent",
            }]}
          >
            {selectedEmpId && empMap[selectedEmpId] ? (
              <View style={styles.empPickerSelected}>
                <View style={[styles.empPickerAvatar, { backgroundColor: empMap[selectedEmpId].color || colors.primary }]}>
                  <Text style={styles.empPickerAvatarText}>
                    {empMap[selectedEmpId].name.split(" ").slice(0, 2).map((w: string) => w[0]).join("")}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.empPickerName, { color: colors.foreground }]}>{empMap[selectedEmpId].name}</Text>
                  <Text style={[styles.empPickerRole, { color: colors.mutedForeground }]}>{empMap[selectedEmpId].role}</Text>
                </View>
                <Feather name="check-circle" size={18} color={colors.primary} />
              </View>
            ) : (
              <View style={styles.empPickerPlaceholder}>
                <Feather name="user" size={16} color={colors.mutedForeground} />
                <Text style={[styles.empPickerPlaceholderText, { color: colors.mutedForeground }]}>Выбрать исполнителя</Text>
                <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={createTask}
            disabled={creating || !newTaskName.trim() || !selectedEmpId}
            style={[styles.createBtn, {
              backgroundColor: creating || !newTaskName.trim() || !selectedEmpId ? colors.border : colors.primary,
              borderRadius: colors.radius / 2,
            }]}
          >
            {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.createBtnText}>Создать задачу</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Модальное окно выбора исполнителя */}
      <Modal visible={showEmpPicker} animationType="slide" transparent onRequestClose={() => setShowEmpPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Выбрать исполнителя</Text>
              <TouchableOpacity onPress={() => setShowEmpPicker(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {(employees || []).map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  style={[styles.empRow2, {
                    backgroundColor: selectedEmpId === emp.id ? colors.primary + "15" : "transparent",
                    borderRadius: colors.radius / 2,
                  }]}
                  onPress={() => { setSelectedEmpId(emp.id); setShowEmpPicker(false); }}
                >
                  <View style={[styles.empAvatar2, { backgroundColor: emp.color || colors.primary }]}>
                    <Text style={styles.empAvatarText2}>
                      {emp.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("")}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.empName2, { color: colors.foreground }]}>{emp.name}</Text>
                    <Text style={[styles.empRole2, { color: colors.mutedForeground }]}>{emp.role}</Text>
                  </View>
                  {selectedEmpId === emp.id && (
                    <Feather name="check" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {viewMode === "list" && (
        <>
          <View style={[styles.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={[styles.searchBar, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                placeholder="Поиск задач..."
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={[styles.filterScroll, { backgroundColor: colors.card }]}
            contentContainerStyle={styles.filterContent}
          >
            {FILTERS.map((f) => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)}
                style={[styles.filterChip, { backgroundColor: filter === f ? colors.primary : colors.muted, borderRadius: 100 }]}
              >
                <Text style={[styles.filterText, { color: filter === f ? "#fff" : colors.mutedForeground }]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : filtered.length === 0 ? (
            <EmptyState icon="check-square" title="Нет задач" subtitle="Задачи не найдены" />
          ) : (
            <FlatList
              data={filtered}
              renderItem={renderItem}
              keyExtractor={(t) => String(t.id)}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews
              maxToRenderPerBatch={12}
              windowSize={10}
            />
          )}
        </>
      )}

      {viewMode === "kanban" && (
        <View style={{ flex: 1 }}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.kanbanScroll, { paddingBottom: 100 }]}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {STATUSES.map((status) => (
                <MemoKanbanColumn
                  key={status}
                  status={status}
                  tasks={kanbanGroups[status] || []}
                  empMap={empMap}
                  colors={colors}
                  onPress={handlePress}
                />
              ))}
            </ScrollView>
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
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  headerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  formCard: { padding: 16, gap: 10 },
  input: { padding: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  createBtn: { padding: 12, alignItems: "center", justifyContent: "center" },
  createBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  searchRow: { padding: 12, borderBottomWidth: 1 },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  filterScroll: { flexGrow: 0, borderBottomWidth: 1 },
  filterContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: "row" },
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
  taskHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  taskName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  taskDesc: { fontSize: 13, fontFamily: "Inter_400Regular" },
  taskFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  empRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  empDot: { width: 8, height: 8, borderRadius: 4 },
  empName: { fontSize: 12, fontFamily: "Inter_400Regular" },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  dueDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  kanbanScroll: { padding: 12, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  kanbanCol: {
    width: 210,
    maxHeight: 580,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    overflow: "hidden",
  },
  kanbanHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 10,
    borderBottomWidth: 1,
  },
  kanbanDot: { width: 8, height: 8, borderRadius: 4 },
  kanbanTitle: { flex: 1, fontSize: 12, fontFamily: "Inter_700Bold" },
  kanbanCount: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 },
  kanbanCountText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  kanbanCard: {
    padding: 10,
    margin: 6,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  kanbanCardName: { fontSize: 12, fontFamily: "Inter_600SemiBold", lineHeight: 17 },
  kProgBg: { height: 3, borderRadius: 2, overflow: "hidden" },
  kProgFill: { height: 3, borderRadius: 2 },
  kanbanMeta: { flexDirection: "row", justifyContent: "space-between" },
  kanbanEmp: { fontSize: 10, fontFamily: "Inter_400Regular" },
  kanbanDue: { fontSize: 10, fontFamily: "Inter_400Regular" },
  emptyCol: { alignItems: "center", padding: 20 },
  emptyColText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  // Employee picker (form)
  empPickerBtn: { padding: 12 },
  empPickerPlaceholder: { flexDirection: "row", alignItems: "center", gap: 8 },
  empPickerPlaceholderText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  empPickerSelected: { flexDirection: "row", alignItems: "center", gap: 10 },
  empPickerAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  empPickerAvatarText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  empPickerName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  empPickerRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 18, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalList: { padding: 12 },
  empRow2: { flexDirection: "row", alignItems: "center", padding: 10, gap: 12, marginBottom: 4 },
  empAvatar2: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  empAvatarText2: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  empName2: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  empRole2: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
