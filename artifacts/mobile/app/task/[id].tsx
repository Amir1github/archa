import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet, apiPut, apiDelete, apiPost } from "@/constants/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import type { Task, Employee, TaskComment } from "@/types";

const STATUSES = ["Новая", "В работе", "На проверке", "Выполнена", "Заблокирована"];

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ["task", id],
    queryFn: () => apiGet(`/api/tasks/${id}`),
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

  const emp = task ? empMap[task.emp_id] : null;

  const updateStatus = async (status: string) => {
    if (!task) return;
    setUpdatingStatus(true);
    try {
      await apiPut(`/api/tasks/${id}`, { status });
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch {
      Alert.alert("Ошибка", "Не удалось обновить статус");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const deleteTask = async () => {
    Alert.alert("Удалить задачу?", "Это действие нельзя отменить", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          try {
            await apiDelete(`/api/tasks/${id}`);
            qc.invalidateQueries({ queryKey: ["tasks"] });
            qc.invalidateQueries({ queryKey: ["stats"] });
            router.back();
          } catch {
            Alert.alert("Ошибка", "Не удалось удалить задачу");
          }
        },
      },
    ]);
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    setSendingComment(true);
    try {
      await apiPost(`/api/tasks/${id}/comments`, { emp_id: user?.id ?? 1, text: comment });
      setComment("");
      qc.invalidateQueries({ queryKey: ["task", id] });
    } catch {
      Alert.alert("Ошибка", "Не удалось отправить комментарий");
    } finally {
      setSendingComment(false);
    }
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Задача не найдена</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Задача",
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primary,
          headerRight: () => (
            <TouchableOpacity onPress={deleteTask} style={{ marginRight: 4 }}>
              <Feather name="trash-2" size={20} color={colors.danger} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderRadius: colors.radius,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <Text style={[styles.taskName, { color: colors.foreground }]}>
            {task.name}
          </Text>
          {task.description ? (
            <Text style={[styles.taskDesc, { color: colors.mutedForeground }]}>
              {task.description}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <StatusBadge status={task.priority} />
            <StatusBadge status={task.status} />
          </View>
          <ProgressBar progress={task.progress} />
          <View style={styles.detailsGrid}>
            {emp && (
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                  Исполнитель
                </Text>
                <View style={styles.empRow}>
                  <View
                    style={[styles.empDot, { backgroundColor: emp.color }]}
                  />
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>
                    {emp.name}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.detailItem}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                Категория
              </Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>
                {task.category}
              </Text>
            </View>
            {task.due_date && (
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                  Срок
                </Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>
                  {task.due_date.split("-").reverse().join(".")}
                  {task.due_time ? `  ${task.due_time}` : ""}
                </Text>
              </View>
            )}
            <View style={styles.detailItem}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                Создана
              </Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>
                {task.created_at?.slice(0, 10)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Изменить статус
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusList}
        >
          {STATUSES.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => updateStatus(s)}
              disabled={updatingStatus || task.status === s}
              style={[
                styles.statusChip,
                {
                  backgroundColor:
                    task.status === s ? colors.primary : colors.muted,
                  borderRadius: colors.radius / 2,
                  opacity: updatingStatus ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusChipText,
                  { color: task.status === s ? "#fff" : colors.mutedForeground },
                ]}
              >
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Комментарии
        </Text>
        <View
          style={[
            styles.commentInput,
            {
              backgroundColor: colors.card,
              borderRadius: colors.radius,
              borderColor: colors.border,
            },
          ]}
        >
          <TextInput
            placeholder="Написать комментарий..."
            placeholderTextColor={colors.mutedForeground}
            value={comment}
            onChangeText={setComment}
            multiline
            style={[styles.commentText, { color: colors.foreground }]}
          />
          <TouchableOpacity
            onPress={sendComment}
            disabled={sendingComment || !comment.trim()}
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  sendingComment || !comment.trim()
                    ? colors.border
                    : colors.primary,
                borderRadius: colors.radius / 2,
              },
            ]}
          >
            {sendingComment ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 60 },
  card: {
    padding: 16,
    gap: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  taskName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  taskDesc: { fontSize: 14, fontFamily: "Inter_400Regular" },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  detailsGrid: { gap: 12 },
  detailItem: { gap: 2 },
  detailLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  empRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  empDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    paddingTop: 4,
  },
  statusList: { gap: 8, paddingBottom: 4 },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  statusChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  commentInput: {
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  commentText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 60,
    textAlignVertical: "top",
  },
  sendBtn: {
    alignSelf: "flex-end",
    padding: 10,
  },
});
