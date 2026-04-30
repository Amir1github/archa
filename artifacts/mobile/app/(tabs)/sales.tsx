import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Platform, KeyboardAvoidingView,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet, apiPut, apiPost } from "@/constants/api";
import type { Employee } from "@/types";

interface SalesFact { manager_id: number; period: string; amount: number; updated_at: string; }
interface SalesPlan { manager_id: number; period: string; amount: number; updated_at: string; }
interface SalesHistory { year: number; month: number; category: string; amount: number; }

type PeriodType = "month" | "quarter" | "year";
type TabKey = "analytics" | "plan" | "history" | "forecast";

const MONTH_NAMES = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const QUARTER_LABELS = ["Q1 (Янв-Мар)", "Q2 (Апр-Июн)", "Q3 (Июл-Сен)", "Q4 (Окт-Дек)"];

function fmtM(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}B`;
  return `${n.toFixed(0)}M`;
}

export default function SalesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const [activeTab, setActiveTab] = useState<TabKey>("analytics");
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [editingPlan, setEditingPlan] = useState<{ manager_id: number; period: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [fcTab, setFcTab] = useState<"main"|"history"|"factors"|"nom"|"ai">("main");
  const [fcAiInput, setFcAiInput] = useState("");
  const [fcAiLoading, setFcAiLoading] = useState(false);
  const [fcAiMessages, setFcAiMessages] = useState<{role:"user"|"ai"; text:string}[]>([]);
  const fcScrollRef = useRef<ScrollView>(null);

  const { data: facts = [], isLoading: loadFacts } = useQuery<SalesFact[]>({
    queryKey: ["sales-facts"],
    queryFn: () => apiGet("/api/sales/facts"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: plans = [], isLoading: loadPlans } = useQuery<SalesPlan[]>({
    queryKey: ["sales-plans"],
    queryFn: () => apiGet("/api/sales/plans"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: history = [], isLoading: loadHist } = useQuery<SalesHistory[]>({
    queryKey: ["sales-history"],
    queryFn: () => apiGet("/api/sales/history"),
    enabled: activeTab === "history" || activeTab === "forecast",
    staleTime: 5 * 60 * 1000,
  });
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
  });

  const updatePlan = useMutation({
    mutationFn: (data: { manager_id: number; period: string; amount: number }) =>
      apiPut("/api/sales/plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-plans"] });
      setEditingPlan(null);
    },
  });

  const empMap = useMemo(() => {
    const m: Record<number, Employee> = {};
    employees.forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const planMap = useMemo(() => {
    const m: Record<string, number> = {};
    plans.forEach((p) => (m[`${p.manager_id}_${p.period}`] = p.amount));
    return m;
  }, [plans]);

  const factMap = useMemo(() => {
    const m: Record<string, number> = {};
    facts.forEach((f) => (m[`${f.manager_id}_${f.period}`] = f.amount));
    return m;
  }, [facts]);

  const monthlyData = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => {
      const period = `${selectedYear}-${String(idx + 1).padStart(2, "0")}`;
      const totalPlan = employees.reduce((s, e) => s + (planMap[`${e.id}_${period}`] || 0), 0);
      const totalFact = employees.reduce((s, e) => s + (factMap[`${e.id}_${period}`] || 0), 0);
      return { name, period, plan: totalPlan, fact: totalFact };
    });
  }, [plans, facts, employees, selectedYear, planMap, factMap]);

  const quarterlyData = useMemo(() => {
    return [1, 2, 3, 4].map((q, idx) => {
      const period = `${selectedYear}-Q${q}`;
      const totalPlan = employees.reduce((s, e) => s + (planMap[`${e.id}_${period}`] || 0), 0);
      const months = [0, 1, 2].map((m) => String((q - 1) * 3 + m + 1).padStart(2, "0"));
      const totalFact = employees.reduce((s, e) => s + months.reduce((ms, mo) => ms + (factMap[`${e.id}_${selectedYear}-${mo}`] || 0), 0), 0);
      return { name: `Q${q}`, label: QUARTER_LABELS[idx], period, plan: totalPlan, fact: totalFact };
    });
  }, [plans, facts, employees, selectedYear, planMap, factMap]);

  const yearlyData = useMemo(() => {
    const period = `${selectedYear}`;
    const totalPlan = employees.reduce((s, e) => s + (planMap[`${e.id}_${period}`] || 0), 0);
    const totalFact = facts.filter((f) => f.period.startsWith(String(selectedYear))).reduce((s, f) => s + f.amount, 0);
    return { plan: totalPlan, fact: totalFact, pct: totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0 };
  }, [plans, facts, employees, selectedYear, planMap]);

  const activeData = periodType === "month" ? monthlyData : periodType === "quarter" ? quarterlyData : [];
  const maxBar = Math.max(...activeData.map((d) => Math.max(d.plan, d.fact)), 1);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const isLoading = loadFacts || loadPlans;

  const totalFact = monthlyData.reduce((s, d) => s + d.fact, 0);
  const totalPlan = monthlyData.reduce((s, d) => s + d.plan, 0);
  const overallPct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

  function startEdit(manager_id: number, period: string) {
    if (!can("sales.manage")) return;
    const key = `${manager_id}_${period}`;
    setEditValue(String(planMap[key] || 0));
    setEditingPlan({ manager_id, period });
  }

  function savePlan() {
    if (!editingPlan) return;
    const amount = parseFloat(editValue);
    if (isNaN(amount) || amount < 0) {
      Alert.alert("Ошибка", "Введите корректную сумму");
      return;
    }
    updatePlan.mutate({ manager_id: editingPlan.manager_id, period: editingPlan.period, amount });
  }

  const PERIODS: PeriodType[] = ["month", "quarter", "year"];
  const PERIOD_LABELS: Record<PeriodType, string> = { month: "Месяц", quarter: "Квартал", year: "Год" };

  const sendFcAI = useCallback(async (msg?: string) => {
    const text = (msg ?? fcAiInput).trim();
    if (!text) return;
    setFcAiMessages((prev) => [...prev, { role: "user", text }]);
    setFcAiInput("");
    setFcAiLoading(true);
    setTimeout(() => fcScrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const context = `Данные прогноза: базовый прогноз на год ${fmtM(forecastData.annualBase)}, тренд ${forecastData.trend > 0 ? "+" : ""}${forecastData.trend}%, достоверность ${forecastData.confidence}%, лет данных ${forecastData.histYears}. История продаж по годам: ${Object.keys(historyByYear).map((y) => `${y}: ${fmtM(Object.values(historyByYear[Number(y)]).flat().reduce((s, v) => s + v, 0))}`).join(", ")}. Компания: мебельный завод Пойтахт, Таджикистан, Душанбе.`;
      const res = await apiPost<{ response: string }>("/api/ai/chat", { message: text, context });
      setFcAiMessages((prev) => [...prev, { role: "ai", text: res.response }]);
    } catch {
      setFcAiMessages((prev) => [...prev, { role: "ai", text: "Ошибка: не удалось получить ответ от AI" }]);
    } finally {
      setFcAiLoading(false);
      setTimeout(() => fcScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [fcAiInput, forecastData, historyByYear]);

  const fcNomData = useMemo(() => {
    const cats: Record<string, number> = {};
    history.forEach((h) => {
      if (h.category) cats[h.category] = (cats[h.category] || 0) + h.amount;
    });
    const maxYears = Object.keys(historyByYear).map(Number);
    const latestYear = Math.max(...maxYears, 0);
    const prevYear = latestYear - 1;
    return Object.entries(cats)
      .map(([cat, total]) => {
        const latestAmt = history.filter((h) => h.year === latestYear && h.category === cat).reduce((s, h) => s + h.amount, 0);
        const prevAmt = history.filter((h) => h.year === prevYear && h.category === cat).reduce((s, h) => s + h.amount, 0);
        const growth = prevAmt > 0 ? Math.round(((latestAmt - prevAmt) / prevAmt) * 100) : 0;
        const forecast = Math.round(latestAmt * (1 + forecastData.trend / 100));
        return { cat, total, latestAmt, growth, forecast };
      })
      .sort((a, b) => b.total - a.total);
  }, [history, historyByYear, forecastData]);

  const seasonalityData = useMemo(() => {
    const months = new Array(12).fill(0);
    history.forEach((h) => {
      if (h.month >= 1 && h.month <= 12) months[h.month - 1] += h.amount;
    });
    const total = months.reduce((s, v) => s + v, 1);
    return MONTH_NAMES.map((name, i) => ({ name, amount: months[i], pct: Math.round((months[i] / total) * 100) }));
  }, [history]);

  const TAJIK_FACTORS = [
    { group: "Макроэкономика · Таджикистан", items: [
      { name: "Рост ВВП (прогноз МВФ)", value: "+5.5%", trend: "up" },
      { name: "Инфляция (НБТ)", value: "5.8%", trend: "neutral" },
      { name: "Курс USD/TJS", value: "10.93", trend: "neutral" },
      { name: "Ставка НБТ", value: "10.5%", trend: "neutral" },
    ]},
    { group: "Строительство и жильё", items: [
      { name: "Рост строительного сектора", value: "+8.2%", trend: "up" },
      { name: "Новые жилые проекты", value: "+120 объектов", trend: "up" },
      { name: "Ипотечная ставка", value: "14%", trend: "neutral" },
    ]},
    { group: "Сезонность", items: [
      { name: "Пик продаж (апр–май)", value: "рост +12%", trend: "up" },
      { name: "Спад (янв–фев)", value: "снижение -8%", trend: "down" },
      { name: "Навруз (март)", value: "рост +15%", trend: "up" },
    ]},
    { group: "Рынок мебели", items: [
      { name: "Рост рынка мебели в РТ", value: "+7.3%", trend: "up" },
      { name: "Конкуренция (импорт)", value: "умеренная", trend: "neutral" },
      { name: "Доля Пойтахт на рынке", value: "≈14%", trend: "up" },
    ]},
  ];

  const historyByYear = useMemo(() => {
    const years: Record<number, Record<string, number[]>> = {};
    history.forEach((h) => {
      if (!years[h.year]) years[h.year] = {};
      if (!years[h.year][h.category]) years[h.year][h.category] = new Array(12).fill(0);
      years[h.year][h.category][h.month - 1] = h.amount;
    });
    return years;
  }, [history]);

  const forecastData = useMemo(() => {
    const curYear = new Date().getFullYear();
    const curMonth = new Date().getMonth();
    const yearTotals: Record<number, number> = {};
    history.forEach((h) => {
      yearTotals[h.year] = (yearTotals[h.year] || 0) + h.amount;
    });
    const sortedYears = Object.keys(yearTotals).map(Number).sort();
    let trend = 0;
    if (sortedYears.length >= 2) {
      const last = yearTotals[sortedYears[sortedYears.length - 1]] || 0;
      const prev = yearTotals[sortedYears[sortedYears.length - 2]] || 0;
      trend = prev > 0 ? (last - prev) / prev : 0;
    }
    const lastYearTotal = yearTotals[curYear - 1] || yearTotals[sortedYears[sortedYears.length - 1]] || 0;
    const baseAnnual = lastYearTotal * (1 + trend);
    const monthlyBase = MONTH_NAMES.map((name, i) => {
      const seasonFactor = [0.065, 0.07, 0.085, 0.09, 0.09, 0.085, 0.08, 0.085, 0.09, 0.095, 0.075, 0.09][i];
      const base = baseAnnual * seasonFactor;
      const factThisYear = facts.filter((f) => f.period === `${curYear}-${String(i + 1).padStart(2, "0")}`).reduce((s, f) => s + f.amount, 0);
      return {
        name,
        base: Math.round(base),
        optimistic: Math.round(base * 1.15),
        pessimistic: Math.round(base * 0.85),
        actual: i < curMonth ? factThisYear : null,
        isFuture: i >= curMonth,
      };
    });
    const annualBase = Math.round(baseAnnual);
    const confidence = Math.min(95, Math.max(50, 70 + sortedYears.length * 5));
    return { monthlyBase, annualBase, trend: Math.round(trend * 100), confidence, histYears: sortedYears.length };
  }, [history, facts]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Продажи</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={{ flexDirection: "row" }}>
          {([["analytics", "Аналитика", "bar-chart-2"], ["plan", "Планы", "target"], ["history", "История", "clock"], ["forecast", "Прогноз", "trending-up"]] as [TabKey, string, string][]).map(([key, label, icon]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setActiveTab(key)}
              style={[styles.tab, activeTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Feather name={icon as any} size={13} color={activeTab === key ? colors.primary : colors.mutedForeground} style={{ marginRight: 4 }} />
              <Text style={[styles.tabText, { color: activeTab === key ? colors.primary : colors.mutedForeground }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {activeTab === "analytics" && (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {/* Summary */}
              <View style={[styles.summaryCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30", borderRadius: colors.radius }]}>
                <View style={styles.summaryRow}>
                  <View>
                    <Text style={[styles.summaryBig, { color: colors.primary }]}>{fmtM(totalFact)}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Факт {selectedYear}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.summaryBig, { color: overallPct >= 100 ? colors.success : overallPct >= 80 ? colors.warning : colors.danger }]}>{overallPct}%</Text>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>выполнение</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.summaryMed, { color: colors.foreground }]}>{fmtM(totalPlan)}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>план</Text>
                  </View>
                </View>
                <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
                  <View style={[styles.progressFill, { width: `${Math.min(overallPct, 100)}%`, backgroundColor: overallPct >= 100 ? colors.success : overallPct >= 80 ? colors.warning : colors.danger }]} />
                </View>
              </View>

              {/* Period switch */}
              <View style={styles.periodRow}>
                <View style={styles.yearNav}>
                  <TouchableOpacity onPress={() => setSelectedYear((y) => y - 1)}>
                    <Feather name="chevron-left" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.yearText, { color: colors.foreground }]}>{selectedYear}</Text>
                  <TouchableOpacity onPress={() => setSelectedYear((y) => Math.min(y + 1, new Date().getFullYear()))}>
                    <Feather name="chevron-right" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.periodSwitch}>
                  {PERIODS.map((p) => (
                    <TouchableOpacity key={p} onPress={() => setPeriodType(p)}
                      style={[styles.periodBtn, { backgroundColor: periodType === p ? colors.primary : colors.muted, borderRadius: 100 }]}
                    >
                      <Text style={[styles.periodText, { color: periodType === p ? "#fff" : colors.mutedForeground }]}>{PERIOD_LABELS[p]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Chart */}
              {periodType === "year" ? (
                <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                  <Text style={[styles.chartTitle, { color: colors.foreground }]}>Годовой план / факт</Text>
                  <View style={styles.yearRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.yearMetric, { color: colors.primary }]}>{fmtM(yearlyData.plan)}</Text>
                      <Text style={[styles.yearMetricLabel, { color: colors.mutedForeground }]}>План</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={[styles.yearMetric, { color: yearlyData.pct >= 100 ? colors.success : colors.warning }]}>{yearlyData.pct}%</Text>
                      <Text style={[styles.yearMetricLabel, { color: colors.mutedForeground }]}>Выполнение</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <Text style={[styles.yearMetric, { color: colors.foreground }]}>{fmtM(yearlyData.fact)}</Text>
                      <Text style={[styles.yearMetricLabel, { color: colors.mutedForeground }]}>Факт</Text>
                    </View>
                  </View>
                  <View style={[styles.progressBg, { backgroundColor: colors.muted, height: 12, borderRadius: 6 }]}>
                    <View style={[styles.progressFill, { width: `${Math.min(yearlyData.pct, 100)}%`, backgroundColor: yearlyData.pct >= 100 ? colors.success : colors.warning, height: 12, borderRadius: 6 }]} />
                  </View>
                </View>
              ) : (
                <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                  <Text style={[styles.chartTitle, { color: colors.foreground }]}>
                    {periodType === "month" ? "Продажи по месяцам" : "Продажи по кварталам"}
                  </Text>
                  <View style={styles.legend}>
                    <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.primary }]} /><Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>План</Text></View>
                    <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.success }]} /><Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Факт</Text></View>
                  </View>
                  <View style={styles.barChart}>
                    {activeData.map((item) => {
                      const planH = maxBar > 0 ? (item.plan / maxBar) * 140 : 0;
                      const factH = maxBar > 0 ? (item.fact / maxBar) * 140 : 0;
                      const pct = item.plan > 0 ? Math.round((item.fact / item.plan) * 100) : 0;
                      return (
                        <View key={item.period} style={styles.barGroup}>
                          <Text style={[styles.barPct, { color: pct >= 100 ? colors.success : pct > 0 ? colors.warning : colors.mutedForeground }]}>
                            {item.fact > 0 ? `${pct}%` : ""}
                          </Text>
                          <View style={styles.barPair}>
                            <View style={[styles.bar, { height: planH, backgroundColor: colors.primary + "60" }]} />
                            <View style={[styles.bar, { height: factH, backgroundColor: factH >= planH ? colors.success : colors.warning }]} />
                          </View>
                          <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>{item.name}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Manager performance */}
              <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                <Text style={[styles.chartTitle, { color: colors.foreground }]}>По менеджерам (YTD)</Text>
                {employees.map((emp) => {
                  const empFact = facts.filter((f) => f.manager_id === emp.id).reduce((s, f) => s + f.amount, 0);
                  const empPlan = plans.filter((p) => p.manager_id === emp.id && p.period.startsWith(String(selectedYear)) && p.period.length === 7).reduce((s, p) => s + p.amount, 0);
                  const pct = empPlan > 0 ? Math.round((empFact / empPlan) * 100) : 0;
                  return (
                    <View key={emp.id} style={{ marginBottom: 12 }}>
                      <View style={styles.mgrRow}>
                        <View style={[styles.empDot, { backgroundColor: emp.color }]} />
                        <Text style={[styles.mgrName, { color: colors.foreground }]}>{emp.name}</Text>
                        <Text style={[styles.mgrPct, { color: pct >= 100 ? colors.success : pct >= 70 ? colors.warning : colors.danger }]}>{pct}%</Text>
                        <Text style={[styles.mgrAmt, { color: colors.mutedForeground }]}>{fmtM(empFact)} / {fmtM(empPlan)}</Text>
                      </View>
                      <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
                        <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: pct >= 100 ? colors.success : pct >= 70 ? colors.warning : colors.danger }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {activeTab === "plan" && (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.periodRow}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Управление планами</Text>
                <View style={styles.yearNav}>
                  <TouchableOpacity onPress={() => setSelectedYear((y) => y - 1)}>
                    <Feather name="chevron-left" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.yearText, { color: colors.foreground }]}>{selectedYear}</Text>
                  <TouchableOpacity onPress={() => setSelectedYear((y) => Math.min(y + 1, new Date().getFullYear() + 1))}>
                    <Feather name="chevron-right" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.periodSwitchFull}>
                {(["month", "quarter", "year"] as PeriodType[]).map((p) => (
                  <TouchableOpacity key={p} onPress={() => setPeriodType(p)}
                    style={[styles.periodBtnFull, { backgroundColor: periodType === p ? colors.primary : colors.muted, borderRadius: 8 }]}
                  >
                    <Text style={[styles.periodText, { color: periodType === p ? "#fff" : colors.mutedForeground }]}>{PERIOD_LABELS[p]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {employees.map((emp) => {
                const periods = periodType === "month"
                  ? MONTH_NAMES.map((name, idx) => ({ label: name, period: `${selectedYear}-${String(idx + 1).padStart(2, "0")}` }))
                  : periodType === "quarter"
                  ? [1, 2, 3, 4].map((q) => ({ label: `Q${q}`, period: `${selectedYear}-Q${q}` }))
                  : [{ label: String(selectedYear), period: String(selectedYear) }];

                return (
                  <View key={emp.id} style={[styles.planCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                    <View style={styles.planHeader}>
                      <View style={[styles.empDotLg, { backgroundColor: emp.color }]} />
                      <Text style={[styles.empName, { color: colors.foreground }]}>{emp.name}</Text>
                      <Text style={[styles.empRole2, { color: colors.mutedForeground }]}>{emp.role}</Text>
                    </View>
                    <View style={styles.planGrid}>
                      {periods.map(({ label, period }) => {
                        const key = `${emp.id}_${period}`;
                        const current = planMap[key] || 0;
                        const fact = factMap[key] || 0;
                        const isEditing = editingPlan?.manager_id === emp.id && editingPlan?.period === period;
                        const pct = current > 0 ? Math.round((fact / current) * 100) : 0;
                        return (
                          <View key={period} style={[styles.planItem, { backgroundColor: colors.muted, borderRadius: colors.radius / 2 }]}>
                            <Text style={[styles.planPeriod, { color: colors.mutedForeground }]}>{label}</Text>
                            {isEditing ? (
                              <View style={styles.editRow}>
                                <TextInput
                                  value={editValue}
                                  onChangeText={setEditValue}
                                  keyboardType="numeric"
                                  style={[styles.editInput, { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.background }]}
                                  autoFocus
                                />
                                <TouchableOpacity onPress={savePlan} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
                                  <Feather name="check" size={14} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setEditingPlan(null)}>
                                  <Feather name="x" size={16} color={colors.mutedForeground} />
                                </TouchableOpacity>
                              </View>
                            ) : can("sales.manage") ? (
                              <TouchableOpacity onPress={() => startEdit(emp.id, period)} style={styles.planValueRow}>
                                <Text style={[styles.planValue, { color: colors.foreground }]}>{fmtM(current)}</Text>
                                <Feather name="edit-2" size={11} color={colors.mutedForeground} />
                              </TouchableOpacity>
                            ) : (
                              <View style={styles.planValueRow}>
                                <Text style={[styles.planValue, { color: colors.foreground }]}>{fmtM(current)}</Text>
                              </View>
                            )}
                            {fact > 0 && (
                              <Text style={[styles.planFact, { color: pct >= 100 ? colors.success : colors.warning }]}>
                                факт: {fmtM(fact)} ({pct}%)
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {activeTab === "history" && (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {loadHist ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
                Object.entries(historyByYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, cats]) => (
                  <View key={year} style={[styles.histCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                    <Text style={[styles.histYear, { color: colors.foreground }]}>{year}</Text>
                    {Object.entries(cats).map(([cat, months]) => {
                      const total = months.reduce((s, m) => s + m, 0);
                      const maxM = Math.max(...months, 1);
                      return (
                        <View key={cat} style={{ marginBottom: 14 }}>
                          <View style={styles.histCatRow}>
                            <Text style={[styles.histCat, { color: colors.foreground }]}>{cat}</Text>
                            <Text style={[styles.histTotal, { color: colors.primary }]}>{fmtM(total)}</Text>
                          </View>
                          <View style={styles.miniChart}>
                            {months.map((val, idx) => (
                              <View key={idx} style={styles.miniBarWrap}>
                                <View style={[styles.miniBar, { height: maxM > 0 ? (val / maxM) * 40 : 0, backgroundColor: colors.primary + (val > 0 ? "cc" : "20") }]} />
                                <Text style={[styles.miniBarLabel, { color: colors.mutedForeground }]}>{MONTH_NAMES[idx].charAt(0)}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {activeTab === "forecast" && (
            <View style={{ flex: 1 }}>
              {/* Forecast Sub-tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={[styles.fcSubTabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
                contentContainerStyle={{ flexDirection: "row" }}
              >
                {([["main","Прогноз","trending-up"],["history","История","clock"],["factors","Факторы","globe"],["nom","Товары","package"],["ai","AI Аналитик","cpu"]] as const).map(([key, label, icon]) => (
                  <TouchableOpacity key={key} onPress={() => setFcTab(key)}
                    style={[styles.fcSubTab, fcTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  >
                    <Feather name={icon} size={11} color={fcTab === key ? colors.primary : colors.mutedForeground} style={{ marginRight: 3 }} />
                    <Text style={[styles.fcSubTabText, { color: fcTab === key ? colors.primary : colors.mutedForeground }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* ── MAIN FORECAST ── */}
              {fcTab === "main" && (
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                  {loadHist ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
                    <>
                      <View style={[styles.fcHero, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                        <Text style={styles.fcHeroTitle}>Прогноз продаж</Text>
                        <Text style={styles.fcHeroYear}>{new Date().getFullYear()}</Text>
                        <Text style={styles.fcHeroAmt}>{fmtM(forecastData.annualBase)}</Text>
                        <Text style={styles.fcHeroLabel}>базовый прогноз (год)</Text>
                        <View style={styles.fcHeroRow}>
                          <View style={styles.fcHeroStat}><Text style={styles.fcHeroStatVal}>{forecastData.trend > 0 ? "+" : ""}{forecastData.trend}%</Text><Text style={styles.fcHeroStatLabel}>тренд</Text></View>
                          <View style={[styles.fcHeroDiv, { backgroundColor: "rgba(255,255,255,0.3)" }]} />
                          <View style={styles.fcHeroStat}><Text style={styles.fcHeroStatVal}>{forecastData.confidence}%</Text><Text style={styles.fcHeroStatLabel}>достоверность</Text></View>
                          <View style={[styles.fcHeroDiv, { backgroundColor: "rgba(255,255,255,0.3)" }]} />
                          <View style={styles.fcHeroStat}><Text style={styles.fcHeroStatVal}>{forecastData.histYears}</Text><Text style={styles.fcHeroStatLabel}>лет данных</Text></View>
                        </View>
                      </View>
                      <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Сценарии на год</Text>
                        {[
                          { label: "Оптимистичный", val: forecastData.annualBase * 1.15, color: colors.success, icon: "trending-up" },
                          { label: "Базовый", val: forecastData.annualBase, color: colors.primary, icon: "minus" },
                          { label: "Пессимистичный", val: forecastData.annualBase * 0.85, color: colors.danger, icon: "trending-down" },
                        ].map((sc) => (
                          <View key={sc.label} style={[styles.scRow, { borderBottomColor: colors.border }]}>
                            <View style={[styles.scIcon, { backgroundColor: sc.color + "15" }]}><Feather name={sc.icon as any} size={14} color={sc.color} /></View>
                            <Text style={[styles.scLabel, { color: colors.foreground }]}>{sc.label}</Text>
                            <Text style={[styles.scAmt, { color: sc.color }]}>{fmtM(Math.round(sc.val))}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Прогноз по месяцам</Text>
                        <View style={styles.legend}>
                          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.primary }]} /><Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Прогноз</Text></View>
                          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.success }]} /><Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Факт</Text></View>
                        </View>
                        <View style={styles.barChart}>
                          {forecastData.monthlyBase.map((item) => {
                            const maxVal = Math.max(...forecastData.monthlyBase.map((m) => Math.max(m.base, m.actual || 0)), 1);
                            return (
                              <View key={item.name} style={styles.barGroup}>
                                <View style={styles.barPair}>
                                  <View style={[styles.bar, { height: (item.base / maxVal) * 120, backgroundColor: item.isFuture ? colors.primary + "40" : colors.primary + "20", borderTopWidth: 2, borderTopColor: colors.primary }]} />
                                  {item.actual !== null && <View style={[styles.bar, { height: (item.actual / maxVal) * 120, backgroundColor: item.actual >= item.base ? colors.success : colors.warning }]} />}
                                </View>
                                <Text style={[styles.barLabel, { color: item.isFuture ? colors.primary : colors.mutedForeground }]}>{item.name}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  )}
                </ScrollView>
              )}

              {/* ── HISTORY ── */}
              {fcTab === "history" && (
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                  {loadHist ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
                    <>
                      <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Продажи по годам</Text>
                        {Object.entries(historyByYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, cats]) => {
                          const total = Object.values(cats).flat().reduce((s, v) => s + v, 0);
                          return (
                            <View key={year} style={[styles.histCard, { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 10 }]}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={[styles.histYear, { color: colors.foreground, fontSize: 15 }]}>{year}</Text>
                                <Text style={[styles.histTotal, { color: colors.primary }]}>{fmtM(total)}</Text>
                              </View>
                            </View>
                          );
                        })}
                        {Object.keys(historyByYear).length === 0 && <Text style={[styles.factorName, { color: colors.mutedForeground }]}>Нет исторических данных</Text>}
                      </View>
                      <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Сезонность по месяцам</Text>
                        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 100, gap: 3 }}>
                          {seasonalityData.map((m) => {
                            const maxPct = Math.max(...seasonalityData.map((s) => s.pct), 1);
                            return (
                              <View key={m.name} style={{ flex: 1, alignItems: "center", gap: 2 }}>
                                <View style={[{ width: "90%", borderRadius: 3, backgroundColor: colors.primary, opacity: 0.6 + (m.pct / maxPct) * 0.4, height: (m.pct / maxPct) * 80, minHeight: 4 }]} />
                                <Text style={{ fontSize: 8, color: colors.mutedForeground }}>{m.name}</Text>
                              </View>
                            );
                          })}
                        </View>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                          {seasonalityData.map((m) => (
                            <Text key={m.name} style={{ fontSize: 11, color: colors.mutedForeground }}>{m.name}: {m.pct}%</Text>
                          ))}
                        </View>
                      </View>
                    </>
                  )}
                </ScrollView>
              )}

              {/* ── FACTORS ── */}
              {fcTab === "factors" && (
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                  {TAJIK_FACTORS.map((group) => (
                    <View key={group.group} style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                      <Text style={[styles.chartTitle, { color: colors.foreground }]}>{group.group}</Text>
                      {group.items.map((item) => (
                        <View key={item.name} style={[styles.factorRow, { borderBottomColor: colors.border }]}>
                          <View style={[styles.factorIcon, { backgroundColor: (item.trend === "up" ? colors.success : item.trend === "down" ? colors.danger : colors.muted) + "30" }]}>
                            <Feather name={item.trend === "up" ? "trending-up" : item.trend === "down" ? "trending-down" : "minus"} size={13} color={item.trend === "up" ? colors.success : item.trend === "down" ? colors.danger : colors.mutedForeground} />
                          </View>
                          <Text style={[styles.factorName, { color: colors.foreground }]}>{item.name}</Text>
                          <Text style={[styles.factorImpact, { color: item.trend === "up" ? colors.success : item.trend === "down" ? colors.danger : colors.mutedForeground }]}>{item.value}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* ── NOMENCLATURE ── */}
              {fcTab === "nom" && (
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                  {loadHist ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : fcNomData.length === 0 ? (
                    <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                      <Text style={[styles.factorName, { color: colors.mutedForeground }]}>Нет данных по товарным группам. Загрузите историю из 1С.</Text>
                    </View>
                  ) : (
                    <>
                      <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Прогноз по группам товаров</Text>
                        {fcNomData.map((d) => (
                          <View key={d.cat} style={[styles.factorRow, { borderBottomColor: colors.border }]}>
                            <View style={[styles.factorIcon, { backgroundColor: colors.primary + "15" }]}><Feather name="package" size={13} color={colors.primary} /></View>
                            <Text style={[styles.factorName, { color: colors.foreground }]}>{d.cat}</Text>
                            <View style={{ alignItems: "flex-end" }}>
                              <Text style={[styles.factorImpact, { color: colors.primary }]}>{fmtM(d.forecast)}</Text>
                              <Text style={{ fontSize: 10, color: d.growth >= 0 ? colors.success : colors.danger, fontFamily: "Inter_500Medium" }}>{d.growth >= 0 ? "+" : ""}{d.growth}%</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                      <View style={[styles.chartCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Топ-5 роста</Text>
                        {[...fcNomData].sort((a, b) => b.growth - a.growth).slice(0, 5).map((d) => (
                          <View key={d.cat} style={[styles.scRow, { borderBottomColor: colors.border }]}>
                            <View style={[styles.scIcon, { backgroundColor: colors.success + "15" }]}><Feather name="trending-up" size={13} color={colors.success} /></View>
                            <Text style={[styles.scLabel, { color: colors.foreground }]}>{d.cat}</Text>
                            <Text style={[styles.scAmt, { color: colors.success }]}>+{d.growth}%</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </ScrollView>
              )}

              {/* ── AI ANALYST ── */}
              {fcTab === "ai" && (
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                  <ScrollView
                    ref={fcScrollRef}
                    contentContainerStyle={[styles.content, { flexGrow: 1, paddingBottom: 20 }]}
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={() => fcScrollRef.current?.scrollToEnd({ animated: true })}
                  >
                    {fcAiMessages.length === 0 && (
                      <>
                        <Text style={[styles.chartTitle, { color: colors.mutedForeground, textAlign: "center", marginTop: 20 }]}>AI Аналитик прогноза</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                          {["Почему такой прогноз?","Как улучшить продажи?","Сезонные риски?","Лучший квартал?"].map((q) => (
                            <TouchableOpacity key={q} onPress={() => sendFcAI(q)}
                              style={[styles.scRow, { backgroundColor: colors.muted, borderRadius: colors.radius, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0, flex: 0 }]}>
                              <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_500Medium" }}>{q}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}
                    {fcAiMessages.map((m, i) => (
                      <View key={i} style={[styles.aiMsg, { alignSelf: m.role === "user" ? "flex-end" : "flex-start", backgroundColor: m.role === "user" ? colors.primary : colors.card, borderRadius: colors.radius }]}>
                        <Text style={{ color: m.role === "user" ? "#fff" : colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular" }}>{m.text}</Text>
                      </View>
                    ))}
                    {fcAiLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
                  </ScrollView>
                  <View style={[styles.aiInputWrap, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                    <TextInput
                      value={fcAiInput}
                      onChangeText={setFcAiInput}
                      placeholder="Спросите о прогнозе..."
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.aiInput, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 20 }]}
                      onSubmitEditing={() => sendFcAI()}
                      returnKeyType="send"
                    />
                    <TouchableOpacity onPress={() => sendFcAI()} style={[styles.aiSendBtn, { backgroundColor: colors.primary }]}>
                      <Feather name="send" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 0, borderBottomWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 10 },
  tabRow: { flexDirection: "row" },
  tab: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  content: { padding: 12, gap: 12, paddingBottom: 100 },
  summaryCard: { padding: 16, borderWidth: 1, gap: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  summaryBig: { fontSize: 26, fontFamily: "Inter_700Bold" },
  summaryMed: { fontSize: 18, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  periodRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  yearNav: { flexDirection: "row", alignItems: "center", gap: 8 },
  yearText: { fontSize: 16, fontFamily: "Inter_700Bold", minWidth: 40, textAlign: "center" },
  periodSwitch: { flexDirection: "row", gap: 6 },
  periodBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  periodSwitchFull: { flexDirection: "row", gap: 8 },
  periodBtnFull: { flex: 1, alignItems: "center", paddingVertical: 8 },
  periodText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  chartCard: { padding: 16, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  chartTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },
  legend: { flexDirection: "row", gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  barChart: { flexDirection: "row", alignItems: "flex-end", height: 170, gap: 4 },
  barGroup: { flex: 1, alignItems: "center", gap: 4 },
  barPair: { flexDirection: "row", gap: 2, alignItems: "flex-end" },
  bar: { width: 10, borderRadius: 3, minHeight: 2 },
  barLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  barPct: { fontSize: 8, fontFamily: "Inter_600SemiBold" },
  progressBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  mgrRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  empDot: { width: 8, height: 8, borderRadius: 4 },
  empDotLg: { width: 12, height: 12, borderRadius: 6 },
  mgrName: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  mgrPct: { fontSize: 13, fontFamily: "Inter_700Bold" },
  mgrAmt: { fontSize: 11, fontFamily: "Inter_400Regular" },
  yearRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  yearMetric: { fontSize: 20, fontFamily: "Inter_700Bold" },
  yearMetricLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  planCard: { padding: 14, gap: 12, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  empName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  empRole2: { fontSize: 11, fontFamily: "Inter_400Regular" },
  planGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  planItem: { width: "30%", padding: 8, gap: 4 },
  planPeriod: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  planValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  planValue: { fontSize: 13, fontFamily: "Inter_700Bold", flex: 1 },
  planFact: { fontSize: 10, fontFamily: "Inter_400Regular" },
  editRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  editInput: { flex: 1, fontSize: 13, borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  saveBtn: { padding: 4, borderRadius: 4 },
  histCard: { padding: 16, gap: 8, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  histYear: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 8 },
  histCatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  histCat: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  histTotal: { fontSize: 13, fontFamily: "Inter_700Bold" },
  miniChart: { flexDirection: "row", alignItems: "flex-end", height: 50, gap: 2 },
  miniBarWrap: { flex: 1, alignItems: "center", gap: 2 },
  miniBar: { width: "100%", borderRadius: 2, minHeight: 2 },
  miniBarLabel: { fontSize: 8 },
  fcHero: { padding: 20, alignItems: "center", gap: 4 },
  fcHeroTitle: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_500Medium" },
  fcHeroYear: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular" },
  fcHeroAmt: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold", marginTop: 4 },
  fcHeroLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 12 },
  fcHeroRow: { flexDirection: "row", alignItems: "center", gap: 0, width: "100%" },
  fcHeroStat: { flex: 1, alignItems: "center" },
  fcHeroStatVal: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  fcHeroStatLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontFamily: "Inter_400Regular" },
  fcHeroDiv: { width: 1, height: 24 },
  fcSubTabBar: { borderBottomWidth: 1, maxHeight: 40, flexShrink: 0 },
  fcSubTab: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  fcSubTabText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  aiMsg: { maxWidth: "82%", padding: 12, marginVertical: 4 },
  aiInputWrap: { flexDirection: "row", alignItems: "center", padding: 10, borderTopWidth: 1, gap: 8 },
  aiInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  aiSendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  scRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  scIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  scLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  scAmt: { fontSize: 16, fontFamily: "Inter_700Bold" },
  factorRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  factorIcon: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  factorName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  factorImpact: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
