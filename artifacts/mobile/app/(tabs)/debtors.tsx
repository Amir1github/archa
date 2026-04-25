import React, { useState, useMemo } from "react";
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
import { EmptyState } from "@/components/EmptyState";
import type { Debtor, Employee } from "@/types";

function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} млрд`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} тыс`;
  return `${n}`;
}

const STATUS_MAP: Record<string, string> = {
  negotiating: "Переговоры",
  promised: "Обещал",
  legal: "Правовые меры",
  partial: "Частично",
  dispute: "Спор",
  paid: "Оплачено",
};

const STATUS_COLOR: Record<string, string> = {
  negotiating: "#3b82f6",
  promised: "#f59e0b",
  legal: "#ef4444",
  partial: "#10b981",
  dispute: "#8b5cf6",
  paid: "#6b7280",
};

type TabKey = "debtors" | "ai" | "report";

function getRisk(d: Debtor): "critical" | "high" | "medium" | "low" {
  if (d.overdue_days > 90) return "critical";
  if (d.overdue_days > 60) return "high";
  if (d.overdue_days > 30) return "medium";
  return "low";
}

function getRiskLabel(risk: string) {
  if (risk === "critical") return "Критический";
  if (risk === "high") return "Высокий риск";
  if (risk === "medium") return "Средний риск";
  return "Низкий риск";
}

function getRiskColor(risk: string, colors: ReturnType<typeof useColors>) {
  if (risk === "critical") return colors.danger;
  if (risk === "high") return "#f97316";
  if (risk === "medium") return colors.warning;
  return colors.success;
}

function getAiRecommendation(d: Debtor): { action: string; priority: "срочно" | "важно" | "плановое" } {
  if (d.status === "paid") return { action: "Долг погашен, архивировать", priority: "плановое" };
  if (d.overdue_days > 90 && d.status !== "legal")
    return { action: "Передать в юридический отдел. Направить претензию.", priority: "срочно" };
  if (d.overdue_days > 90 && d.status === "legal")
    return { action: "Следить за ходом юридического дела. Контролировать сроки.", priority: "срочно" };
  if (d.overdue_days > 60)
    return { action: "Провести встречу с руководством. Потребовать график оплаты.", priority: "важно" };
  if (d.overdue_days > 30)
    return { action: "Позвонить контактному лицу. Получить обещание об оплате.", priority: "важно" };
  if ((d.comments || []).length === 0)
    return { action: "Установить первичный контакт. Добавить комментарий.", priority: "плановое" };
  return { action: "Продолжать мониторинг. Следить за сроком оплаты.", priority: "плановое" };
}

export default function DebtorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("debtors");
  const [filter, setFilter] = useState("Все");
  const [search, setSearch] = useState("");

  const { data: debtors = [], isLoading, refetch } = useQuery<Debtor[]>({
    queryKey: ["debtors"],
    queryFn: () => apiGet("/api/debtors"),
  });
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
  });

  const empMap = useMemo(() => {
    const m: Record<number, Employee> = {};
    employees.forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const activeDebtors = debtors.filter((d) => d.status !== "paid");

  const stats = useMemo(() => {
    const total = activeDebtors.reduce((s, d) => s + d.debt, 0);
    const overdue = activeDebtors.filter((d) => d.overdue_days > 30).length;
    const critical = activeDebtors.filter((d) => d.overdue_days > 90).length;
    const noComment = activeDebtors.filter((d) => (d.comments || []).length === 0).length;
    return { total, overdue, critical, noComment };
  }, [activeDebtors]);

  const FILTERS = ["Все", "Критич.", "Риск", "Без комм.", "Оплачено"];

  const filtered = useMemo(() => debtors.filter((d) => {
    if (filter === "Критич." && d.overdue_days <= 90) return false;
    if (filter === "Риск" && (d.overdue_days <= 30 || d.overdue_days > 90)) return false;
    if (filter === "Без комм." && (d.comments || []).length > 0) return false;
    if (filter === "Оплачено" && d.status !== "paid") return false;
    if (filter === "Все" && d.status === "paid") return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [debtors, filter, search]);

  const aiItems = useMemo(() =>
    [...activeDebtors]
      .sort((a, b) => b.overdue_days - a.overdue_days)
      .map((d) => ({ debtor: d, ...getAiRecommendation(d) })),
    [activeDebtors]
  );

  const reportByStatus = useMemo(() => {
    const groups: Record<string, { count: number; total: number }> = {};
    activeDebtors.forEach((d) => {
      if (!groups[d.status]) groups[d.status] = { count: 0, total: 0 };
      groups[d.status].count++;
      groups[d.status].total += d.debt;
    });
    return Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  }, [activeDebtors]);

  const reportByManager = useMemo(() => {
    const groups: Record<number, { name: string; count: number; total: number; color: string }> = {};
    activeDebtors.forEach((d) => {
      const emp = empMap[d.manager_id];
      if (!groups[d.manager_id]) groups[d.manager_id] = { name: emp?.name || "—", count: 0, total: 0, color: emp?.color || "#999" };
      groups[d.manager_id].count++;
      groups[d.manager_id].total += d.debt;
    });
    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [activeDebtors, empMap]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Дебиторы</Text>
        <View style={styles.tabRow}>
          {([["debtors", "Список"], ["ai", "AI-Агент"], ["report", "Отчёт"]] as [TabKey, string][]).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setActiveTab(key)}
              style={[
                styles.tab,
                activeTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
            >
              {key === "ai" && (
                <Feather name="cpu" size={13} color={activeTab === key ? colors.primary : colors.mutedForeground} style={{ marginRight: 4 }} />
              )}
              {key === "report" && (
                <Feather name="file-text" size={13} color={activeTab === key ? colors.primary : colors.mutedForeground} style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.tabText, { color: activeTab === key ? colors.primary : colors.mutedForeground }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Stats Cards */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <StatCard label="Общий долг" value={formatMoney(stats.total * 1_000_000)} color={colors.foreground} />
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <StatCard label="Просрочено" value={`${stats.overdue}`} color={colors.warning} />
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <StatCard label="Критических" value={`${stats.critical}`} color={colors.danger} />
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <StatCard label="Без комм." value={`${stats.noComment}`} color={colors.mutedForeground} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {activeTab === "debtors" && (
            <DebtorsTab
              debtors={filtered}
              filter={filter}
              search={search}
              filters={FILTERS}
              empMap={empMap}
              colors={colors}
              onFilterChange={setFilter}
              onSearchChange={setSearch}
              onRefresh={refetch}
            />
          )}
          {activeTab === "ai" && (
            <AiAgentTab items={aiItems} empMap={empMap} colors={colors} />
          )}
          {activeTab === "report" && (
            <ReportTab
              debtors={activeDebtors}
              byStatus={reportByStatus}
              byManager={reportByManager}
              stats={stats}
              colors={colors}
            />
          )}
        </>
      )}
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DebtorsTab({
  debtors, filter, search, filters, empMap, colors, onFilterChange, onSearchChange, onRefresh,
}: {
  debtors: Debtor[];
  filter: string;
  search: string;
  filters: string[];
  empMap: Record<number, Employee>;
  colors: ReturnType<typeof useColors>;
  onFilterChange: (f: string) => void;
  onSearchChange: (s: string) => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            placeholder="Поиск дебитора..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={onSearchChange}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterScroll, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => onFilterChange(f)}
            style={[
              styles.filterChip,
              { backgroundColor: filter === f ? colors.primary : colors.muted, borderRadius: 100 },
            ]}
          >
            <Text style={[styles.filterText, { color: filter === f ? "#fff" : colors.mutedForeground }]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {debtors.length === 0 ? (
        <EmptyState icon="dollar-sign" title="Нет дебиторов" subtitle="По выбранным фильтрам ничего не найдено" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {debtors.map((d) => {
            const mgr = empMap[d.manager_id];
            const risk = getRisk(d);
            const statusColor = STATUS_COLOR[d.status] || "#999";
            const lastComment = (d.comments || []).slice(-1)[0];
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
                    borderLeftColor: getRiskColor(risk, colors),
                  },
                ]}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.debtorName, { color: colors.foreground }]} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text style={[styles.debtAmount, { color: d.overdue_days > 60 ? colors.danger : colors.warning }]}>
                    {d.debt.toFixed(1)} млн
                  </Text>
                </View>

                {d.inn && (
                  <Text style={[styles.inn, { color: colors.mutedForeground }]}>ИНН: {d.inn}</Text>
                )}

                <View style={styles.tagsRow}>
                  {d.overdue_days > 0 && (
                    <View style={[styles.tag, { backgroundColor: d.overdue_days > 60 ? "#ef444420" : "#f59e0b20" }]}>
                      <Feather
                        name="calendar"
                        size={10}
                        color={d.overdue_days > 60 ? "#ef4444" : "#f59e0b"}
                        style={{ marginRight: 3 }}
                      />
                      <Text style={[styles.tagText, { color: d.overdue_days > 60 ? "#ef4444" : "#f59e0b" }]}>
                        {d.overdue_days}д
                      </Text>
                    </View>
                  )}
                  <View style={[styles.tag, { backgroundColor: statusColor + "20" }]}>
                    <Text style={[styles.tagText, { color: statusColor }]}>
                      {STATUS_MAP[d.status] || d.status}
                    </Text>
                  </View>
                  {(d.comments || []).length === 0 && (
                    <View style={[styles.tag, { backgroundColor: colors.muted }]}>
                      <Feather name="alert-circle" size={10} color={colors.mutedForeground} style={{ marginRight: 3 }} />
                      <Text style={[styles.tagText, { color: colors.mutedForeground }]}>нет комм.</Text>
                    </View>
                  )}
                  {mgr && (
                    <View style={styles.mgrRow}>
                      <View style={[styles.empDot, { backgroundColor: mgr.color }]} />
                      <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{mgr.name}</Text>
                    </View>
                  )}
                </View>

                {lastComment && (
                  <View style={[styles.commentRow, { borderTopColor: colors.border }]}>
                    <Feather name="message-circle" size={11} color={colors.mutedForeground} style={{ marginRight: 5 }} />
                    <Text style={[styles.commentText, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {lastComment.text}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

function AiAgentTab({
  items,
  empMap,
  colors,
}: {
  items: { debtor: Debtor; action: string; priority: "срочно" | "важно" | "плановое" }[];
  empMap: Record<number, Employee>;
  colors: ReturnType<typeof useColors>;
}) {
  const priorityColor = {
    срочно: colors.danger,
    важно: colors.warning,
    плановое: colors.primary,
  };

  const groups = useMemo(() => ({
    срочно: items.filter((i) => i.priority === "срочно"),
    важно: items.filter((i) => i.priority === "важно"),
    плановое: items.filter((i) => i.priority === "плановое"),
  }), [items]);

  const overallRisk = useMemo(() => {
    const critical = items.filter((i) => i.debtor.overdue_days > 90);
    const totalDebt = items.reduce((s, i) => s + i.debtor.debt, 0);
    const criticalDebt = critical.reduce((s, i) => s + i.debtor.debt, 0);
    return { critical: critical.length, totalDebt, criticalDebt, pct: totalDebt > 0 ? Math.round((criticalDebt / totalDebt) * 100) : 0 };
  }, [items]);

  return (
    <ScrollView contentContainerStyle={[styles.list, { gap: 0, paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
      {/* AI Summary */}
      <View style={[styles.aiSummary, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "40", borderRadius: colors.radius }]}>
        <View style={styles.aiSummaryHeader}>
          <Feather name="cpu" size={18} color={colors.primary} />
          <Text style={[styles.aiSummaryTitle, { color: colors.primary }]}>Анализ рисков</Text>
        </View>
        <Text style={[styles.aiSummaryText, { color: colors.foreground }]}>
          Обнаружено <Text style={{ fontFamily: "Inter_700Bold", color: colors.danger }}>{overallRisk.critical}</Text> критических
          дебиторов с долгом <Text style={{ fontFamily: "Inter_700Bold", color: colors.danger }}>{overallRisk.criticalDebt.toFixed(1)} млн сум</Text>
          {" "}({overallRisk.pct}% от общей суммы). Требуются немедленные действия.
        </Text>
      </View>

      {(["срочно", "важно", "плановое"] as const).map((priority) => (
        groups[priority].length > 0 && (
          <View key={priority} style={{ marginTop: 16 }}>
            <View style={styles.sectionHeader}>
              <View style={[styles.priorityDot, { backgroundColor: priorityColor[priority] }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {priority === "срочно" ? "Срочные действия" : priority === "важно" ? "Важные действия" : "Плановые задачи"}
              </Text>
              <View style={[styles.countBadge, { backgroundColor: priorityColor[priority] + "20" }]}>
                <Text style={[styles.countText, { color: priorityColor[priority] }]}>{groups[priority].length}</Text>
              </View>
            </View>

            {groups[priority].map(({ debtor: d, action }) => {
              const mgr = empMap[d.manager_id];
              return (
                <View
                  key={d.id}
                  style={[
                    styles.aiCard,
                    {
                      backgroundColor: colors.card,
                      borderRadius: colors.radius,
                      shadowColor: colors.shadow,
                      borderLeftColor: priorityColor[priority],
                    },
                  ]}
                >
                  <View style={styles.aiCardTop}>
                    <Text style={[styles.debtorName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                      {d.name}
                    </Text>
                    <Text style={[styles.debtAmount, { color: colors.danger, fontSize: 14 }]}>
                      {d.debt.toFixed(1)} млн
                    </Text>
                  </View>
                  <View style={styles.aiMeta}>
                    {d.overdue_days > 0 && (
                      <View style={[styles.tag, { backgroundColor: priorityColor[priority] + "20" }]}>
                        <Text style={[styles.tagText, { color: priorityColor[priority] }]}>{d.overdue_days} дн.</Text>
                      </View>
                    )}
                    {mgr && (
                      <View style={styles.mgrRow}>
                        <View style={[styles.empDot, { backgroundColor: mgr.color }]} />
                        <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{mgr.name}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.actionBox, { backgroundColor: colors.muted, borderRadius: colors.radius / 2 }]}>
                    <Feather name="arrow-right-circle" size={13} color={priorityColor[priority]} style={{ marginRight: 6 }} />
                    <Text style={[styles.actionText, { color: colors.foreground, flex: 1 }]}>{action}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )
      ))}
    </ScrollView>
  );
}

function ReportTab({
  debtors,
  byStatus,
  byManager,
  stats,
  colors,
}: {
  debtors: Debtor[];
  byStatus: [string, { count: number; total: number }][];
  byManager: { name: string; count: number; total: number; color: string }[];
  stats: { total: number; overdue: number; critical: number; noComment: number };
  colors: ReturnType<typeof useColors>;
}) {
  const maxStatusDebt = byStatus[0]?.[1]?.total || 1;
  const maxMgrDebt = byManager[0]?.total || 1;

  return (
    <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
      {/* Summary */}
      <View style={[styles.reportCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
        <Text style={[styles.reportCardTitle, { color: colors.foreground }]}>Сводка</Text>
        <View style={styles.reportRow}>
          <Text style={[styles.reportLabel, { color: colors.mutedForeground }]}>Всего дебиторов</Text>
          <Text style={[styles.reportValue, { color: colors.foreground }]}>{debtors.length}</Text>
        </View>
        <View style={styles.reportRow}>
          <Text style={[styles.reportLabel, { color: colors.mutedForeground }]}>Общий долг</Text>
          <Text style={[styles.reportValue, { color: colors.danger, fontFamily: "Inter_700Bold" }]}>
            {formatMoney(stats.total * 1_000_000)}
          </Text>
        </View>
        <View style={styles.reportRow}>
          <Text style={[styles.reportLabel, { color: colors.mutedForeground }]}>Просроченных (>30д)</Text>
          <Text style={[styles.reportValue, { color: colors.warning }]}>{stats.overdue}</Text>
        </View>
        <View style={styles.reportRow}>
          <Text style={[styles.reportLabel, { color: colors.mutedForeground }]}>Критических (>90д)</Text>
          <Text style={[styles.reportValue, { color: colors.danger }]}>{stats.critical}</Text>
        </View>
        <View style={styles.reportRow}>
          <Text style={[styles.reportLabel, { color: colors.mutedForeground }]}>Без комментариев</Text>
          <Text style={[styles.reportValue, { color: colors.mutedForeground }]}>{stats.noComment}</Text>
        </View>
      </View>

      {/* By Status */}
      <View style={[styles.reportCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
        <Text style={[styles.reportCardTitle, { color: colors.foreground }]}>По статусу</Text>
        {byStatus.map(([status, data]) => {
          const color = STATUS_COLOR[status] || "#999";
          const pct = Math.round((data.total / maxStatusDebt) * 100);
          return (
            <View key={status} style={{ marginBottom: 12 }}>
              <View style={styles.reportRow}>
                <View style={styles.statusLabelRow}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <Text style={[styles.reportLabel, { color: colors.foreground }]}>{STATUS_MAP[status] || status}</Text>
                  <Text style={[styles.countSmall, { color: colors.mutedForeground }]}>({data.count} кл.)</Text>
                </View>
                <Text style={[styles.reportValue, { color }]}>{data.total.toFixed(1)} млн</Text>
              </View>
              <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* By Manager */}
      <View style={[styles.reportCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
        <Text style={[styles.reportCardTitle, { color: colors.foreground }]}>По менеджеру</Text>
        {byManager.map((mgr) => {
          const pct = Math.round((mgr.total / maxMgrDebt) * 100);
          return (
            <View key={mgr.name} style={{ marginBottom: 12 }}>
              <View style={styles.reportRow}>
                <View style={styles.statusLabelRow}>
                  <View style={[styles.colorDot, { backgroundColor: mgr.color }]} />
                  <Text style={[styles.reportLabel, { color: colors.foreground }]}>{mgr.name}</Text>
                  <Text style={[styles.countSmall, { color: colors.mutedForeground }]}>({mgr.count} кл.)</Text>
                </View>
                <Text style={[styles.reportValue, { color: colors.warning }]}>{mgr.total.toFixed(1)} млн</Text>
              </View>
              <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: mgr.color }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Risk Distribution */}
      <View style={[styles.reportCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
        <Text style={[styles.reportCardTitle, { color: colors.foreground }]}>Распределение риска</Text>
        {(["critical", "high", "medium", "low"] as const).map((risk) => {
          const count = debtors.filter((d) => getRisk(d) === risk).length;
          const pct = debtors.length > 0 ? Math.round((count / debtors.length) * 100) : 0;
          const riskColorMap = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#10b981" };
          const color = riskColorMap[risk];
          return (
            <View key={risk} style={{ marginBottom: 12 }}>
              <View style={styles.reportRow}>
                <View style={styles.statusLabelRow}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <Text style={[styles.reportLabel, { color: colors.foreground }]}>{getRiskLabel(risk)}</Text>
                </View>
                <Text style={[styles.reportValue, { color }]}>{count} ({pct}%)</Text>
              </View>
              <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 0,
    borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 10 },
  tabRow: { flexDirection: "row", gap: 0 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 0,
  },
  statCard: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#888", marginTop: 2, textAlign: "center" },
  statDivider: { width: 1, marginVertical: 4 },
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
  filterContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: "row" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6 },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { padding: 12, gap: 10 },
  card: {
    padding: 14,
    gap: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  debtorName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  debtAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  inn: { fontSize: 11, fontFamily: "Inter_400Regular" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  tag: { flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 100 },
  tagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  mgrRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  empDot: { width: 8, height: 8, borderRadius: 4 },
  commentRow: { flexDirection: "row", alignItems: "center", paddingTop: 6, borderTopWidth: 1 },
  commentText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },

  // AI tab
  aiSummary: { padding: 14, borderWidth: 1, marginBottom: 4 },
  aiSummaryHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  aiSummaryTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  aiSummaryText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", flex: 1 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
  countText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  aiCard: {
    padding: 12,
    gap: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  aiCardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  actionBox: { flexDirection: "row", alignItems: "flex-start", padding: 8 },
  actionText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },

  // Report tab
  reportCard: {
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  reportCardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },
  reportRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  reportLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  reportValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statusLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  colorDot: { width: 8, height: 8, borderRadius: 4 },
  countSmall: { fontSize: 11, fontFamily: "Inter_400Regular" },
  barBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
});
