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
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/constants/api";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import type { Debtor, Employee } from "@/types";

function formatMoney(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}

const STATUS_FILTERS = ["Все", "negotiating", "promised", "legal", "partial", "dispute"];
const STATUS_NAMES: Record<string, string> = {
  "Все": "Все",
  "negotiating": "Переговоры",
  "promised": "Обещан",
  "legal": "Юрид.",
  "partial": "Частично",
  "dispute": "Спор",
};

export default function DebtorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState("Все");
  const [search, setSearch] = useState("");

  const { data: debtors, isLoading, refetch } = useQuery<Debtor[]>({
    queryKey: ["debtors"],
    queryFn: () => apiGet("/api/debtors"),
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

  const filtered = (debtors || []).filter((d) => {
    if (filter !== "Все" && d.status !== filter) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalDebt = filtered.reduce((s, d) => s + d.debt, 0);

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
          Дебиторы
        </Text>
        <View
          style={[
            styles.totalPill,
            { backgroundColor: colors.danger + "20", borderRadius: colors.radius },
          ]}
        >
          <Text style={[styles.totalText, { color: colors.danger }]}>
            {formatMoney(totalDebt * 1000000)} сум
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.searchRow,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.muted, borderRadius: colors.radius },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            placeholder="Поиск дебитора..."
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
        {STATUS_FILTERS.map((f) => (
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
              {STATUS_NAMES[f] || f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="dollar-sign"
          title="Нет дебиторов"
          subtitle="Ни один дебитор не найден"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} />
          }
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((d) => {
            const mgr = empMap[d.manager_id];
            const isOverdue = d.overdue_days > 30;
            return (
              <View
                key={d.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderRadius: colors.radius,
                    shadowColor: colors.shadow,
                    borderLeftWidth: 3,
                    borderLeftColor: isOverdue ? colors.danger : colors.border,
                  },
                ]}
              >
                <View style={styles.cardTop}>
                  <Text
                    style={[styles.debtorName, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {d.name}
                  </Text>
                  <Text style={[styles.debtAmount, { color: colors.danger }]}>
                    {d.debt.toFixed(1)}M
                  </Text>
                </View>
                <View style={styles.cardMid}>
                  {d.inn && (
                    <Text style={[styles.inn, { color: colors.mutedForeground }]}>
                      ИНН: {d.inn}
                    </Text>
                  )}
                  {mgr && (
                    <View style={styles.mgrRow}>
                      <View
                        style={[styles.empDot, { backgroundColor: mgr.color }]}
                      />
                      <Text style={[styles.mgrName, { color: colors.mutedForeground }]}>
                        {mgr.name}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardBottom}>
                  <StatusBadge status={d.status} />
                  {d.overdue_days > 0 && (
                    <View
                      style={[
                        styles.overdueTag,
                        {
                          backgroundColor: isOverdue
                            ? colors.danger + "20"
                            : colors.warning + "20",
                          borderRadius: 100,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.overdueText,
                          { color: isOverdue ? colors.danger : colors.warning },
                        ]}
                      >
                        {d.overdue_days} дн. просрочка
                      </Text>
                    </View>
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
  totalPill: { paddingHorizontal: 12, paddingVertical: 6 },
  totalText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  searchRow: { padding: 12, borderBottomWidth: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
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
  card: {
    padding: 14,
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  debtorName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  debtAmount: { fontSize: 17, fontFamily: "Inter_700Bold" },
  cardMid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inn: { fontSize: 12, fontFamily: "Inter_400Regular" },
  mgrRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  empDot: { width: 8, height: 8, borderRadius: 4 },
  mgrName: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  overdueTag: { paddingHorizontal: 8, paddingVertical: 3 },
  overdueText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
