import React, { useState, useMemo } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Modal, RefreshControl, Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Redirect } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet, apiPost, apiPut, apiDelete } from "@/constants/api";
import type { Employee } from "@/types";

function getTodayISO() { return new Date().toISOString().split("T")[0]; }

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} млн`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} тыс`;
  return n.toFixed(2);
}

interface Rko {
  id: number;
  number: string;
  date: string;
  recipient: string;
  emp_id: number | null;
  emp_name: string | null;
  emp_color: string | null;
  amount: number;
  currency: string;
  basis: string;
  category: string;
  status: "draft" | "signed" | "executed";
  created_by: number | null;
  note: string;
  created_at: string;
  updated_at: string;
}

const STATUS_MAP: Record<string, string> = {
  draft: "Черновик",
  signed: "Подписан",
  executed: "Исполнен",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "#f59e0b",
  signed: "#3b82f6",
  executed: "#10b981",
};

const CATEGORIES = ["Зарплата", "Командировка", "Хоз. расходы", "Материалы", "Услуги", "Прочее"];
const CURRENCIES = ["TJS", "USD", "EUR", "RUB"];

function isRkoUser(role: string): boolean {
  const r = role.toLowerCase();
  return r.includes("директор") || r.includes("главный бухгалт");
}

type FilterKey = "all" | "draft" | "signed" | "executed";

export default function RkoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  if (user && !isRkoUser(user.role || "")) {
    return <Redirect href="/(tabs)" />;
  }

  const [filter, setFilter] = useState<FilterKey>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingRko, setEditingRko] = useState<Rko | null>(null);

  const [form, setForm] = useState({
    date: getTodayISO(),
    recipient: "",
    amount: "",
    currency: "TJS",
    basis: "",
    category: "Прочее",
    status: "draft" as "draft" | "signed" | "executed",
    note: "",
  });

  const { data: rkoList = [], isLoading, refetch } = useQuery<Rko[]>({
    queryKey: ["rko"],
    queryFn: () => apiGet("/api/rko"),
    staleTime: 2 * 60 * 1000,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
    staleTime: 10 * 60 * 1000,
    enabled: showForm,
  });

  const stats = useMemo(() => {
    const total = rkoList.reduce((s, r) => s + r.amount, 0);
    const totalSigned = rkoList.filter((r) => r.status === "signed" || r.status === "executed").reduce((s, r) => s + r.amount, 0);
    const byCategory: Record<string, number> = {};
    rkoList.forEach((r) => { byCategory[r.category] = (byCategory[r.category] || 0) + r.amount; });
    return { total, totalSigned, byCategory };
  }, [rkoList]);

  const filtered = useMemo(() => {
    if (filter === "all") return rkoList;
    return rkoList.filter((r) => r.status === filter);
  }, [rkoList, filter]);

  const openAdd = () => {
    setEditingRko(null);
    setForm({ date: getTodayISO(), recipient: "", amount: "", currency: "TJS", basis: "", category: "Прочее", status: "draft", note: "" });
    setShowForm(true);
  };

  const openEdit = (rko: Rko) => {
    setEditingRko(rko);
    setForm({
      date: rko.date,
      recipient: rko.recipient,
      amount: String(rko.amount),
      currency: rko.currency,
      basis: rko.basis,
      category: rko.category,
      status: rko.status,
      note: rko.note,
    });
    setShowForm(true);
  };

  const saveRko = async () => {
    if (!form.recipient.trim()) { Alert.alert("Ошибка", "Укажите получателя"); return; }
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert("Ошибка", "Укажите сумму"); return; }
    try {
      const body = { ...form, amount: amt, created_by: user?.id };
      if (editingRko) {
        await apiPut(`/api/rko/${editingRko.id}`, body);
      } else {
        await apiPost("/api/rko", body);
      }
      qc.invalidateQueries({ queryKey: ["rko"] });
      setShowForm(false);
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось сохранить");
    }
  };

  const deleteRko = (rko: Rko) => {
    Alert.alert("Удалить РКО?", `${rko.number} — ${fmtNum(rko.amount)} ${rko.currency}`, [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: async () => {
        await apiDelete(`/api/rko/${rko.id}`);
        qc.invalidateQueries({ queryKey: ["rko"] });
      }},
    ]);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const FILTERS: [FilterKey, string][] = [["all","Все"],["draft","Черновик"],["signed","Подписан"],["executed","Исполнен"]];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>РКО</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Расходный кассовый ордер</Text>
          </View>
          <TouchableOpacity onPress={openAdd} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary */}
      <View style={[styles.summaryRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <SumCard label="Всего расходов" value={`${fmtNum(stats.total)} TJS`} color={colors.foreground} />
        <View style={[styles.sumDiv, { backgroundColor: colors.border }]} />
        <SumCard label="Подтверждённо" value={`${fmtNum(stats.totalSigned)} TJS`} color={colors.success} />
        <View style={[styles.sumDiv, { backgroundColor: colors.border }]} />
        <SumCard label="Ордеров" value={`${rkoList.length}`} color={colors.primary} />
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map(([key, label]) => (
          <TouchableOpacity key={key} onPress={() => setFilter(key)}
            style={[styles.filterChip, { backgroundColor: filter === key ? colors.primary : colors.muted, borderRadius: 100 }]}
          >
            <Text style={[styles.filterText, { color: filter === key ? "#fff" : colors.mutedForeground }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* RKO List */}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Feather name="file-minus" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Нет ордеров</Text>
          <TouchableOpacity onPress={openAdd} style={[styles.emptyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Создать РКО</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((rko) => (
            <TouchableOpacity key={rko.id} onPress={() => openEdit(rko)}
              style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow, borderLeftColor: STATUS_COLOR[rko.status] || colors.border, borderLeftWidth: 3 }]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardNum, { color: colors.mutedForeground }]}>{rko.number}</Text>
                  <Text style={[styles.cardRecipient, { color: colors.foreground }]}>{rko.recipient}</Text>
                  <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>{rko.date} · {rko.category}</Text>
                  {rko.basis ? <Text style={[styles.cardBasis, { color: colors.mutedForeground }]}>{rko.basis}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text style={[styles.cardAmount, { color: colors.foreground }]}>{fmtNum(rko.amount)}</Text>
                  <Text style={[styles.cardCurrency, { color: colors.mutedForeground }]}>{rko.currency}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[rko.status] + "20" }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLOR[rko.status] }]}>{STATUS_MAP[rko.status]}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
                <TouchableOpacity onPress={() => openEdit(rko)} style={styles.actionBtn}>
                  <Feather name="edit-2" size={14} color={colors.primary} />
                  <Text style={[styles.actionText, { color: colors.primary }]}>Изменить</Text>
                </TouchableOpacity>
                {rko.status === "draft" && (
                  <TouchableOpacity onPress={async () => {
                    await apiPut(`/api/rko/${rko.id}`, { status: "signed", approved_by: user?.id });
                    qc.invalidateQueries({ queryKey: ["rko"] });
                  }} style={styles.actionBtn}>
                    <Feather name="check-circle" size={14} color={colors.success} />
                    <Text style={[styles.actionText, { color: colors.success }]}>Подписать</Text>
                  </TouchableOpacity>
                )}
                {rko.status === "signed" && (
                  <TouchableOpacity onPress={async () => {
                    await apiPut(`/api/rko/${rko.id}`, { status: "executed" });
                    qc.invalidateQueries({ queryKey: ["rko"] });
                  }} style={styles.actionBtn}>
                    <Feather name="zap" size={14} color={colors.primary} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>Исполнить</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => deleteRko(rko)} style={styles.actionBtn}>
                  <Feather name="trash-2" size={14} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowForm(false)} style={styles.modalClose}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingRko ? "Редактировать РКО" : "Новый РКО"}
            </Text>
            <TouchableOpacity onPress={saveRko} style={[styles.modalSave, { backgroundColor: colors.primary }]}>
              <Text style={styles.modalSaveText}>Сохранить</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Label>Дата</Label>
            <TextInput
              value={form.date}
              onChangeText={(v) => setForm((f) => ({ ...f, date: v }))}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10 }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
            />

            <Label>Получатель</Label>
            <TextInput
              value={form.recipient}
              onChangeText={(v) => setForm((f) => ({ ...f, recipient: v }))}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10 }]}
              placeholder="ФИО или наименование"
              placeholderTextColor={colors.mutedForeground}
            />

            <Label>Основание</Label>
            <TextInput
              value={form.basis}
              onChangeText={(v) => setForm((f) => ({ ...f, basis: v }))}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10 }]}
              placeholder="Основание выплаты"
              placeholderTextColor={colors.mutedForeground}
            />

            <Label>Сумма</Label>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={form.amount}
                onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                style={[styles.input, { flex: 1, color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10 }]}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity key={c} onPress={() => setForm((f) => ({ ...f, currency: c }))}
                      style={[styles.chip, { backgroundColor: form.currency === c ? colors.primary : colors.muted, borderRadius: 8 }]}
                    >
                      <Text style={{ color: form.currency === c ? "#fff" : colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <Label>Категория</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat} onPress={() => setForm((f) => ({ ...f, category: cat }))}
                  style={[styles.chip, { backgroundColor: form.category === cat ? colors.primary : colors.muted, borderRadius: 8 }]}
                >
                  <Text style={{ color: form.category === cat ? "#fff" : colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 12 }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label>Статус</Label>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["draft", "signed", "executed"] as const).map((s) => (
                <TouchableOpacity key={s} onPress={() => setForm((f) => ({ ...f, status: s }))}
                  style={[styles.chip, { backgroundColor: form.status === s ? STATUS_COLOR[s] : colors.muted, borderRadius: 8 }]}
                >
                  <Text style={{ color: form.status === s ? "#fff" : colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 12 }}>{STATUS_MAP[s]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label>Примечание</Label>
            <TextInput
              value={form.note}
              onChangeText={(v) => setForm((f) => ({ ...f, note: v }))}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10, height: 80, textAlignVertical: "top" }]}
              placeholder="Дополнительная информация..."
              placeholderTextColor={colors.mutedForeground}
              multiline
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Label({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={[styles.label, { color: colors.mutedForeground }]}>{children}</Text>;
}

function SumCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.sumCard}>
      <Text style={[styles.sumValue, { color }]}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  sumCard: { flex: 1, alignItems: "center" },
  sumValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sumLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#888", marginTop: 2, textAlign: "center" },
  sumDiv: { width: 1, marginVertical: 4 },
  filterBar: { borderBottomWidth: 1, maxHeight: 48 },
  filterContent: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: "center" },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6 },
  filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  list: { padding: 12, gap: 10 },
  card: { padding: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardTop: { flexDirection: "row", gap: 10 },
  cardNum: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  cardRecipient: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardBasis: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, fontStyle: "italic" },
  cardAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  cardCurrency: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1 },
  modalClose: { padding: 4 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalSave: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  modalSaveText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  modalContent: { padding: 16, gap: 6, paddingBottom: 80 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  chip: { paddingHorizontal: 12, paddingVertical: 8 },
});
