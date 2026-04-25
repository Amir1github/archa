import React from "react";
import { View, Text, StyleSheet } from "react-native";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "Новая": { bg: "#e3f2fd", text: "#1565c0" },
  "В работе": { bg: "#e8f5e9", text: "#2e7d32" },
  "На проверке": { bg: "#fff8e1", text: "#f57f17" },
  "Выполнена": { bg: "#e8f5e9", text: "#1a7a3c" },
  "Заблокирована": { bg: "#fce4ec", text: "#c62828" },
  "present": { bg: "#e8f5e9", text: "#2e7d32" },
  "absent": { bg: "#fce4ec", text: "#c62828" },
  "late": { bg: "#fff8e1", text: "#f57f17" },
  "early_out": { bg: "#ffe0b2", text: "#e65100" },
  "negotiating": { bg: "#e3f2fd", text: "#1565c0" },
  "promised": { bg: "#fff8e1", text: "#f57f17" },
  "legal": { bg: "#fce4ec", text: "#c62828" },
  "partial": { bg: "#e8f5e9", text: "#2e7d32" },
  "dispute": { bg: "#f3e5f5", text: "#6a1b9a" },
  "Высокий": { bg: "#fce4ec", text: "#c62828" },
  "Средний": { bg: "#fff8e1", text: "#f57f17" },
  "Низкий": { bg: "#e8f5e9", text: "#2e7d32" },
};

const STATUS_LABELS: Record<string, string> = {
  present: "Присутствует",
  absent: "Отсутствует",
  late: "Опоздал",
  early_out: "Ранний уход",
  negotiating: "Переговоры",
  promised: "Обещан платёж",
  legal: "Юридический",
  partial: "Частичная оплата",
  dispute: "Спор",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_COLORS[status] || { bg: "#f5f5f5", text: "#757575" };
  const label = STATUS_LABELS[status] || status;

  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.text, { color: style.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  text: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
