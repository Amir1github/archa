import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Platform, KeyboardAvoidingView, Modal, Linking,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet, apiPut, apiPost, apiDelete } from "@/constants/api";
import type { Employee } from "@/types";

interface SalesFact { manager_id: number; period: string; amount: number; updated_at: string; }
interface SalesPlan { manager_id: number; period: string; amount: number; updated_at: string; }
interface SalesHistory { year: number; month: number; category: string; amount: number; }

interface Client {
  id: number; name: string; phone: string; address: string; contact: string;
  category: string; status: string; manager_id: number | null; manager_name: string | null;
  note: string; order_count: number; last_order: string | null; created_at: string;
}
interface RouteStop {
  id: number; route_id: number; client_id: number | null; client_name: string;
  address: string; order_num: number; status: string; note: string; visit_time: string;
}
interface Route {
  id: number; date: string; manager_id: number | null; manager_name: string | null;
  name: string; status: string; stops: RouteStop[];
}
interface OrderItem {
  id: number; order_id: number; product_name: string; category: string;
  qty: number; price: number; total: number;
}
interface Order {
  id: number; number: string; client_id: number | null; client_name: string;
  manager_id: number | null; manager_name: string | null; total: number;
  status: string; note: string; items: OrderItem[]; created_at: string;
}
interface WarehouseItem { id: number; name: string; qty: number; category: string; price?: number; }
interface CartItem { product_name: string; category: string; qty: number; price: number; }

type PeriodType = "month" | "quarter" | "year";
type TabKey = "analytics" | "plan" | "history" | "forecast" | "route" | "clients" | "orders";

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
  const { user } = useAuth();

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

  // ── Маршрут state ──
  const [routeDate, setRouteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [routeMgrFilter, setRouteMgrFilter] = useState<number | null>(null);
  const [showCreateRoute, setShowCreateRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteStops, setNewRouteStops] = useState<{client_name:string;address:string}[]>([{client_name:"",address:""}]);

  // ── Клиенты state ──
  const [clientSearch, setClientSearch] = useState("");
  const [clientCat, setClientCat] = useState("Все");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClient, setNewClient] = useState({ name:"", phone:"", address:"", contact:"", category:"Розница", note:"" });

  // ── Заказы state ──
  const [orderStatus, setOrderStatus] = useState("Все");
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [orderClient, setOrderClient] = useState<{id:number|null;name:string}>({id:null,name:""});
  const [orderNote, setOrderNote] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

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

  // ── New queries ──
  const { data: clients = [], isLoading: loadClients, refetch: refetchClients } = useQuery<Client[]>({
    queryKey: ["clients", clientSearch, clientCat],
    queryFn: () => {
      const params = new URLSearchParams();
      if (clientSearch) params.set("search", clientSearch);
      if (clientCat !== "Все") params.set("category", clientCat);
      return apiGet(`/api/clients?${params}`);
    },
    enabled: activeTab === "clients",
    staleTime: 30_000,
  });

  const { data: routes = [], isLoading: loadRoutes, refetch: refetchRoutes } = useQuery<Route[]>({
    queryKey: ["routes", routeDate, routeMgrFilter],
    queryFn: () => {
      const params = new URLSearchParams({ route_date: routeDate });
      if (routeMgrFilter) params.set("manager_id", String(routeMgrFilter));
      return apiGet(`/api/routes?${params}`);
    },
    enabled: activeTab === "route",
    staleTime: 30_000,
  });

  const { data: orders = [], isLoading: loadOrders, refetch: refetchOrders } = useQuery<Order[]>({
    queryKey: ["orders", orderStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (orderStatus !== "Все") params.set("status", orderStatus);
      return apiGet(`/api/orders?${params}`);
    },
    enabled: activeTab === "orders",
    staleTime: 30_000,
  });

  const { data: warehouse = [] } = useQuery<WarehouseItem[]>({
    queryKey: ["warehouse"],
    queryFn: () => apiGet("/api/warehouse"),
    staleTime: 5 * 60_000,
  });

  // ── New mutations ──
  const createRoute = useMutation({
    mutationFn: (data: object) => apiPost("/api/routes", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["routes"] }); setShowCreateRoute(false); setNewRouteName(""); setNewRouteStops([{client_name:"",address:""}]); },
  });

  const visitStop = useMutation({
    mutationFn: ({ stopId, status }: { stopId: number; status: string }) =>
      apiPut(`/api/routes/stops/${stopId}/visit`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routes"] }),
  });

  const createClient = useMutation({
    mutationFn: (data: object) => apiPost("/api/clients", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); setShowCreateClient(false); setNewClient({ name:"", phone:"", address:"", contact:"", category:"Розница", note:"" }); },
  });

  const createOrder = useMutation({
    mutationFn: (data: object) => apiPost("/api/orders", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); setShowCreateOrder(false); setCart([]); setOrderClient({id:null,name:""}); setOrderNote(""); },
  });

  const updateOrderStatus = useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: string }) =>
      apiPut(`/api/orders/${orderId}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const deleteRoute = useMutation({
    mutationFn: (routeId: number) => apiDelete(`/api/routes/${routeId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routes"] }),
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

  // ── historyByYear must come first: used by forecastData + fcNomData ──
  const historyByYear = useMemo(() => {
    const years: Record<number, Record<string, number[]>> = {};
    history.forEach((h) => {
      if (!years[h.year]) years[h.year] = {};
      if (!years[h.year][h.category]) years[h.year][h.category] = new Array(12).fill(0);
      years[h.year][h.category][h.month - 1] = h.amount;
    });
    return years;
  }, [history]);

  // ── forecastData must come before fcNomData + sendFcAI ──
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

  // ── sendFcAI must come AFTER forecastData + historyByYear ──
  const sendFcAI = useCallback(async (msg?: string) => {
    const text = (msg ?? fcAiInput).trim();
    if (!text) return;
    const newUserMsg = { role: "user" as const, text };
    setFcAiMessages((prev) => [...prev, newUserMsg]);
    setFcAiInput("");
    setFcAiLoading(true);
    setTimeout(() => fcScrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const forecastCtx = `[Контекст прогноза] Базовый прогноз на год: ${fmtM(forecastData.annualBase)}, тренд: ${forecastData.trend > 0 ? "+" : ""}${forecastData.trend}%, достоверность: ${forecastData.confidence}%, лет данных: ${forecastData.histYears}. История по годам: ${Object.keys(historyByYear).map((y) => `${y}: ${fmtM(Object.values(historyByYear[Number(y)]).flat().reduce((s, v) => s + v, 0))}`).join(", ")}.`;
      // Build full messages array including history; inject forecast context on first message
      const allPrev = fcAiMessages;
      const messages = [
        ...(allPrev.length === 0 ? [] : allPrev.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }))),
        { role: "user", content: allPrev.length === 0 ? `${forecastCtx}\n\n${text}` : text },
      ];
      const res = await apiPost<{ response: string }>("/api/ai-chat", { messages });
      setFcAiMessages((prev) => [...prev, { role: "ai", text: res.response }]);
    } catch {
      setFcAiMessages((prev) => [...prev, { role: "ai", text: "Ошибка: не удалось получить ответ от AI" }]);
    } finally {
      setFcAiLoading(false);
      setTimeout(() => fcScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [fcAiInput, fcAiMessages, forecastData, historyByYear]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Продажи</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={{ flexDirection: "row" }}>
          {([
            ["analytics", "Аналитика", "bar-chart-2"],
            ["plan", "Планы", "target"],
            ["history", "История", "clock"],
            ["forecast", "Прогноз", "trending-up"],
            ["route", "Маршрут", "map"],
            ["clients", "Клиенты", "users"],
            ["orders", "Заказы", "shopping-cart"],
          ] as [TabKey, string, string][]).map(([key, label, icon]) => (
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

          {/* ════════════════════ МАРШРУТ TAB ════════════════════ */}
          {activeTab === "route" && (
            <View style={{ flex: 1 }}>
              {/* Date + filter row */}
              <View style={[styles.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => { const d = new Date(routeDate); d.setDate(d.getDate()-1); setRouteDate(d.toISOString().slice(0,10)); }} style={styles.dateArrow}>
                  <Feather name="chevron-left" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.dateText, { color: colors.foreground }]}>{routeDate === new Date().toISOString().slice(0,10) ? "Сегодня" : routeDate}</Text>
                <TouchableOpacity onPress={() => { const d = new Date(routeDate); d.setDate(d.getDate()+1); setRouteDate(d.toISOString().slice(0,10)); }} style={styles.dateArrow}>
                  <Feather name="chevron-right" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setRouteDate(new Date().toISOString().slice(0,10))} style={[styles.todayBtn, { backgroundColor: colors.primary + "20", borderRadius: 8 }]}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Сег.</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setShowCreateRoute(true)} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                  <Feather name="plus" size={14} color="#fff" />
                  <Text style={styles.addBtnText}>Маршрут</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
                {loadRoutes ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> :
                  routes.length === 0 ? (
                    <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
                      <Feather name="map" size={40} color={colors.mutedForeground} />
                      <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Маршрутов на {routeDate} нет</Text>
                      <TouchableOpacity onPress={() => setShowCreateRoute(true)} style={[styles.addBtn, { backgroundColor: colors.primary, alignSelf: "center" }]}>
                        <Feather name="plus" size={14} color="#fff" />
                        <Text style={styles.addBtnText}>Создать маршрут</Text>
                      </TouchableOpacity>
                    </View>
                  ) : routes.map((route) => {
                    const done = route.stops.filter(s => s.status === "visited").length;
                    return (
                      <View key={route.id} style={[styles.routeCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                        <View style={styles.routeHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.routeTitle, { color: colors.foreground }]}>{route.name || `Маршрут #${route.id}`}</Text>
                            <Text style={[styles.routeSub, { color: colors.mutedForeground }]}>{route.manager_name || "—"} · {done}/{route.stops.length} точек</Text>
                          </View>
                          <View style={[styles.tag, { backgroundColor: done === route.stops.length && route.stops.length > 0 ? colors.success+"20" : colors.primary+"15" }]}>
                            <Text style={[styles.tagText, { color: done === route.stops.length && route.stops.length > 0 ? colors.success : colors.primary }]}>
                              {done === route.stops.length && route.stops.length > 0 ? "Завершён" : `${done}/${route.stops.length}`}
                            </Text>
                          </View>
                          {can("sales.manage") && (
                            <TouchableOpacity onPress={() => Alert.alert("Удалить маршрут?","",[ {text:"Отмена"},{text:"Удалить",style:"destructive",onPress:()=>deleteRoute.mutate(route.id)} ])} style={{ marginLeft: 6 }}>
                              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
                            </TouchableOpacity>
                          )}
                        </View>
                        {route.stops.map((stop) => (
                          <View key={stop.id} style={[styles.stopRow, { borderTopColor: colors.border }]}>
                            <View style={[styles.stopDot, { backgroundColor: stop.status === "visited" ? colors.success : stop.status === "skipped" ? colors.danger : colors.muted }]} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.stopName, { color: colors.foreground }]}>{stop.client_name || "Клиент"}</Text>
                              {!!stop.address && <Text style={[styles.stopAddr, { color: colors.mutedForeground }]}>{stop.address}</Text>}
                              {!!stop.visit_time && <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Визит: {stop.visit_time}</Text>}
                            </View>
                            {stop.status === "pending" && (
                              <View style={{ flexDirection: "row", gap: 6 }}>
                                <TouchableOpacity onPress={() => visitStop.mutate({ stopId: stop.id, status: "visited" })} style={[styles.visitBtn, { backgroundColor: colors.success+"20" }]}>
                                  <Feather name="check" size={13} color={colors.success} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => visitStop.mutate({ stopId: stop.id, status: "skipped" })} style={[styles.visitBtn, { backgroundColor: colors.danger+"20" }]}>
                                  <Feather name="x" size={13} color={colors.danger} />
                                </TouchableOpacity>
                                {!!stop.address && Platform.OS !== "web" && (
                                  <TouchableOpacity onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(stop.address)}`)} style={[styles.visitBtn, { backgroundColor: colors.primary+"20" }]}>
                                    <Feather name="navigation" size={13} color={colors.primary} />
                                  </TouchableOpacity>
                                )}
                              </View>
                            )}
                            {stop.status !== "pending" && (
                              <View style={[styles.tag, { backgroundColor: stop.status === "visited" ? colors.success+"20" : colors.danger+"20" }]}>
                                <Text style={[styles.tagText, { color: stop.status === "visited" ? colors.success : colors.danger }]}>{stop.status === "visited" ? "Визит" : "Пропущен"}</Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    );
                  })}
              </ScrollView>

              {/* Create Route Modal */}
              <Modal visible={showCreateRoute} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                  <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                    <View style={styles.modalHeader}>
                      <Text style={[styles.modalTitle, { color: colors.foreground }]}>Новый маршрут</Text>
                      <TouchableOpacity onPress={() => setShowCreateRoute(false)}><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity>
                    </View>
                    <TextInput placeholder="Название маршрута" placeholderTextColor={colors.mutedForeground} value={newRouteName} onChangeText={setNewRouteName} style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10 }]} />
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Точки визита</Text>
                    {newRouteStops.map((stop, i) => (
                      <View key={i} style={{ gap: 6, marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <TextInput placeholder={`Клиент ${i+1}`} placeholderTextColor={colors.mutedForeground} value={stop.client_name} onChangeText={(v) => setNewRouteStops(prev => prev.map((s,j) => j===i ? {...s,client_name:v} : s))} style={[styles.modalInput, { flex: 1, color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10, marginBottom: 0 }]} />
                          {newRouteStops.length > 1 && <TouchableOpacity onPress={() => setNewRouteStops(prev => prev.filter((_,j) => j!==i))} style={{ justifyContent: "center" }}><Feather name="trash-2" size={16} color={colors.danger} /></TouchableOpacity>}
                        </View>
                        <TextInput placeholder="Адрес" placeholderTextColor={colors.mutedForeground} value={stop.address} onChangeText={(v) => setNewRouteStops(prev => prev.map((s,j) => j===i ? {...s,address:v} : s))} style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10, marginBottom: 0 }]} />
                      </View>
                    ))}
                    <TouchableOpacity onPress={() => setNewRouteStops(prev => [...prev, {client_name:"",address:""}])} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                      <Feather name="plus-circle" size={16} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Добавить точку</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => createRoute.mutate({ date: routeDate, manager_id: user?.id, name: newRouteName, stops: newRouteStops.filter(s => s.client_name) })}
                      style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                      disabled={createRoute.isPending}
                    >
                      {createRoute.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Создать маршрут</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            </View>
          )}

          {/* ════════════════════ КЛИЕНТЫ TAB ════════════════════ */}
          {activeTab === "clients" && (
            <View style={{ flex: 1 }}>
              {/* Search + filter */}
              <View style={[styles.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border, flexWrap: "wrap", gap: 8 }]}>
                <View style={[styles.searchBox, { backgroundColor: colors.muted, borderRadius: 10, flex: 1 }]}>
                  <Feather name="search" size={14} color={colors.mutedForeground} />
                  <TextInput
                    placeholder="Поиск клиентов..."
                    placeholderTextColor={colors.mutedForeground}
                    value={clientSearch}
                    onChangeText={setClientSearch}
                    style={[styles.searchInput, { color: colors.foreground }]}
                    returnKeyType="search"
                  />
                  {!!clientSearch && <TouchableOpacity onPress={() => setClientSearch("")}><Feather name="x" size={14} color={colors.mutedForeground} /></TouchableOpacity>}
                </View>
                <TouchableOpacity onPress={() => setShowCreateClient(true)} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                  <Feather name="user-plus" size={14} color="#fff" />
                  <Text style={styles.addBtnText}>Добавить</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
                  {["Все","Розница","Опт","VIP"].map((cat) => (
                    <TouchableOpacity key={cat} onPress={() => setClientCat(cat)} style={[styles.catChip, { backgroundColor: clientCat === cat ? colors.primary : colors.muted, borderRadius: 20 }]}>
                      <Text style={[styles.catChipText, { color: clientCat === cat ? "#fff" : colors.mutedForeground }]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {selectedClient ? (
                <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
                  <TouchableOpacity onPress={() => setSelectedClient(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Feather name="arrow-left" size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Все клиенты</Text>
                  </TouchableOpacity>
                  <View style={[styles.clientDetailCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                    <View style={[styles.clientAvatar, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={{ color: colors.primary, fontSize: 24, fontFamily: "Inter_700Bold" }}>{selectedClient.name.charAt(0)}</Text>
                    </View>
                    <Text style={[styles.clientDetailName, { color: colors.foreground }]}>{selectedClient.name}</Text>
                    <View style={[styles.tag, { backgroundColor: selectedClient.category === "VIP" ? "#f39c1220" : selectedClient.category === "Опт" ? colors.primary+"20" : colors.muted, alignSelf: "center", marginBottom: 12 }]}>
                      <Text style={[styles.tagText, { color: selectedClient.category === "VIP" ? "#f39c12" : selectedClient.category === "Опт" ? colors.primary : colors.mutedForeground }]}>{selectedClient.category}</Text>
                    </View>
                    {[["phone","phone",selectedClient.phone],["map-pin","address",selectedClient.address],["user","contact",selectedClient.contact],["briefcase","manager",selectedClient.manager_name||"—"]].map(([icon,key,val]) => !!val && val !== "—" && (
                      <TouchableOpacity key={key} onPress={() => key==="phone" && Linking.openURL(`tel:${val}`)} style={styles.clientDetailRow}>
                        <Feather name={icon as any} size={14} color={colors.mutedForeground} />
                        <Text style={[styles.clientDetailVal, { color: key==="phone" ? colors.primary : colors.foreground }]}>{val}</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={[styles.clientDetailRow, { marginTop: 8 }]}>
                      <Feather name="shopping-cart" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.clientDetailVal, { color: colors.foreground }]}>{selectedClient.order_count} заказов</Text>
                    </View>
                  </View>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>История заказов</Text>
                  {(selectedClient as any).orders?.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, textAlign: "center", fontSize: 13 }}>Заказов пока нет</Text>
                  ) : (selectedClient as any).orders?.map((o: Order) => (
                    <View key={o.id} style={[styles.orderCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                      <Text style={[styles.orderNum, { color: colors.primary }]}>{o.number}</Text>
                      <Text style={[styles.orderTotal, { color: colors.foreground }]}>{o.total.toLocaleString()} TJS</Text>
                      <View style={[styles.tag, { backgroundColor: ORDER_STATUS_COLOR[o.status]?.bg || colors.muted }]}>
                        <Text style={[styles.tagText, { color: ORDER_STATUS_COLOR[o.status]?.text || colors.mutedForeground }]}>{o.status}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
                  {loadClients ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> :
                    clients.length === 0 ? (
                      <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
                        <Feather name="users" size={40} color={colors.mutedForeground} />
                        <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Клиенты не найдены</Text>
                      </View>
                    ) : clients.map((client) => (
                      <TouchableOpacity key={client.id} onPress={async () => {
                        try { const detail = await apiGet(`/api/clients/${client.id}`); setSelectedClient(detail); } catch { setSelectedClient(client as any); }
                      }} style={[styles.clientCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                        <View style={[styles.clientIcon, { backgroundColor: client.category === "VIP" ? "#f39c1220" : client.category === "Опт" ? colors.primary+"20" : colors.muted }]}>
                          <Text style={{ color: client.category === "VIP" ? "#f39c12" : client.category === "Опт" ? colors.primary : colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 16 }}>{client.name.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[styles.clientName, { color: colors.foreground }]}>{client.name}</Text>
                          {!!client.phone && <Text style={[styles.clientSub, { color: colors.primary }]}>{client.phone}</Text>}
                          {!!client.address && <Text style={[styles.clientSub, { color: colors.mutedForeground }]} numberOfLines={1}>{client.address}</Text>}
                          {client.last_order && <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Посл. заказ: {client.last_order.slice(0,10)}</Text>}
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 4 }}>
                          <View style={[styles.tag, { backgroundColor: client.category === "VIP" ? "#f39c1220" : client.category === "Опт" ? colors.primary+"20" : colors.muted }]}>
                            <Text style={[styles.tagText, { color: client.category === "VIP" ? "#f39c12" : client.category === "Опт" ? colors.primary : colors.mutedForeground }]}>{client.category}</Text>
                          </View>
                          {client.order_count > 0 && <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{client.order_count} зак.</Text>}
                        </View>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              )}

              {/* Create Client Modal */}
              <Modal visible={showCreateClient} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                  <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                    <View style={styles.modalHeader}>
                      <Text style={[styles.modalTitle, { color: colors.foreground }]}>Новый клиент</Text>
                      <TouchableOpacity onPress={() => setShowCreateClient(false)}><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity>
                    </View>
                    {[["Название *","name"],["Телефон","phone"],["Адрес","address"],["Контактное лицо","contact"],["Примечание","note"]].map(([ph,key]) => (
                      <TextInput key={key} placeholder={ph} placeholderTextColor={colors.mutedForeground} value={(newClient as any)[key]} onChangeText={(v) => setNewClient(prev => ({...prev,[key]:v}))} style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10 }]} />
                    ))}
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Категория</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                      {["Розница","Опт","VIP"].map((cat) => (
                        <TouchableOpacity key={cat} onPress={() => setNewClient(prev => ({...prev,category:cat}))} style={[styles.catChip, { backgroundColor: newClient.category === cat ? colors.primary : colors.muted, borderRadius: 8, flex: 1, justifyContent: "center" }]}>
                          <Text style={[styles.catChipText, { color: newClient.category === cat ? "#fff" : colors.mutedForeground, textAlign: "center" }]}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity
                      onPress={() => { if (!newClient.name.trim()) { Alert.alert("Ошибка","Введите название клиента"); return; } createClient.mutate({ ...newClient, manager_id: user?.id }); }}
                      style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                      disabled={createClient.isPending}
                    >
                      {createClient.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Создать клиента</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            </View>
          )}

          {/* ════════════════════ ЗАКАЗЫ TAB ════════════════════ */}
          {activeTab === "orders" && (
            <View style={{ flex: 1 }}>
              {/* Status filter + new order button */}
              <View style={[styles.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["Все","new","confirmed","in_production","shipped","delivered","cancelled"].map((s) => (
                      <TouchableOpacity key={s} onPress={() => setOrderStatus(s)} style={[styles.catChip, { backgroundColor: orderStatus === s ? colors.primary : colors.muted, borderRadius: 20 }]}>
                        <Text style={[styles.catChipText, { color: orderStatus === s ? "#fff" : colors.mutedForeground }]}>{ORDER_STATUS_LABEL[s] || s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <TouchableOpacity onPress={() => setShowCreateOrder(true)} style={[styles.addBtn, { backgroundColor: colors.primary, marginLeft: 8 }]}>
                  <Feather name="plus" size={14} color="#fff" />
                  <Text style={styles.addBtnText}>Заказ</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
                {loadOrders ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> :
                  orders.length === 0 ? (
                    <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
                      <Feather name="shopping-cart" size={40} color={colors.mutedForeground} />
                      <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Заказов пока нет</Text>
                      <TouchableOpacity onPress={() => setShowCreateOrder(true)} style={[styles.addBtn, { backgroundColor: colors.primary, alignSelf: "center" }]}>
                        <Feather name="plus" size={14} color="#fff" />
                        <Text style={styles.addBtnText}>Создать заказ</Text>
                      </TouchableOpacity>
                    </View>
                  ) : orders.map((order) => {
                    const expanded = expandedOrder === order.id;
                    const sc = ORDER_STATUS_COLOR[order.status] || { bg: colors.muted, text: colors.mutedForeground };
                    return (
                      <View key={order.id} style={[styles.orderCardFull, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                        <TouchableOpacity onPress={() => setExpandedOrder(expanded ? null : order.id)} style={styles.orderCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.orderNum, { color: colors.primary, fontSize: 14 }]}>{order.number}</Text>
                            <Text style={[styles.clientName, { color: colors.foreground, fontSize: 13 }]}>{order.client_name || "Клиент не указан"}</Text>
                            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{order.created_at?.slice(0,10)} · {order.manager_name || "—"}</Text>
                          </View>
                          <View style={{ alignItems: "flex-end", gap: 4 }}>
                            <Text style={[styles.orderTotal, { color: colors.foreground }]}>{order.total.toLocaleString()} TJS</Text>
                            <View style={[styles.tag, { backgroundColor: sc.bg }]}><Text style={[styles.tagText, { color: sc.text }]}>{ORDER_STATUS_LABEL[order.status] || order.status}</Text></View>
                          </View>
                          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
                        </TouchableOpacity>
                        {expanded && (
                          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 6 }}>
                            {order.items.map((item, i) => (
                              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ flex: 1, color: colors.foreground, fontSize: 12, fontFamily: "Inter_400Regular" }}>{item.product_name} × {item.qty}</Text>
                                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{item.total.toLocaleString()} TJS</Text>
                              </View>
                            ))}
                            {can("sales.manage") && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                                <View style={{ flexDirection: "row", gap: 6 }}>
                                  {["confirmed","in_production","shipped","delivered","cancelled"].map((s) => (
                                    <TouchableOpacity key={s} onPress={() => updateOrderStatus.mutate({ orderId: order.id, status: s })}
                                      style={[styles.catChip, { backgroundColor: ORDER_STATUS_COLOR[s]?.bg || colors.muted, borderRadius: 8 }]}>
                                      <Text style={[styles.catChipText, { color: ORDER_STATUS_COLOR[s]?.text || colors.mutedForeground }]}>{ORDER_STATUS_LABEL[s]}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </ScrollView>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
              </ScrollView>

              {/* Create Order Modal */}
              <Modal visible={showCreateOrder} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                  <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                    <View style={[styles.modalBoxLg, { backgroundColor: colors.card }]}>
                      <View style={styles.modalHeader}>
                        <Text style={[styles.modalTitle, { color: colors.foreground }]}>Новый заказ</Text>
                        <TouchableOpacity onPress={() => { setShowCreateOrder(false); setCart([]); setOrderClient({id:null,name:""}); setOrderNote(""); }}><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity>
                      </View>
                      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
                        {/* Client selection */}
                        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Клиент</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            {clients.slice(0, 10).map((c) => (
                              <TouchableOpacity key={c.id} onPress={() => setOrderClient({id:c.id,name:c.name})}
                                style={[styles.catChip, { backgroundColor: orderClient.id === c.id ? colors.primary : colors.muted, borderRadius: 8, maxWidth: 140 }]}>
                                <Text style={[styles.catChipText, { color: orderClient.id === c.id ? "#fff" : colors.foreground }]} numberOfLines={1}>{c.name}</Text>
                              </TouchableOpacity>
                            ))}
                            <TextInput placeholder="Другой клиент..." placeholderTextColor={colors.mutedForeground} value={orderClient.id === null ? orderClient.name : ""} onChangeText={(v) => setOrderClient({id:null,name:v})} style={[styles.catChip, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8, minWidth: 120 }]} />
                          </View>
                        </ScrollView>

                        {/* Product picker */}
                        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Товары со склада</Text>
                        {warehouse.slice(0, 20).map((item) => {
                          const cartEntry = cart.find(c => c.product_name === item.name);
                          const qty = cartEntry?.qty || 0;
                          return (
                            <View key={item.id} style={[styles.productRow, { borderBottomColor: colors.border }]}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.productName, { color: colors.foreground }]}>{item.name}</Text>
                                <Text style={[styles.productCat, { color: colors.mutedForeground }]}>{item.category} · Скл: {item.qty}</Text>
                              </View>
                              <View style={styles.qtyRow}>
                                <TouchableOpacity onPress={() => {
                                  if (qty <= 1) setCart(prev => prev.filter(c => c.product_name !== item.name));
                                  else setCart(prev => prev.map(c => c.product_name === item.name ? {...c, qty: c.qty-1, total:(c.qty-1)*c.price} : c));
                                }} style={[styles.qtyBtn, { backgroundColor: qty > 0 ? colors.danger+"20" : colors.muted }]} disabled={qty === 0}>
                                  <Feather name="minus" size={12} color={qty > 0 ? colors.danger : colors.mutedForeground} />
                                </TouchableOpacity>
                                <Text style={[styles.qtyVal, { color: qty > 0 ? colors.foreground : colors.mutedForeground }]}>{qty}</Text>
                                <TouchableOpacity onPress={() => {
                                  if (qty === 0) setCart(prev => [...prev, { product_name:item.name, category:item.category, qty:1, price:0 }]);
                                  else setCart(prev => prev.map(c => c.product_name === item.name ? {...c, qty: c.qty+1} : c));
                                }} style={[styles.qtyBtn, { backgroundColor: colors.primary+"20" }]}>
                                  <Feather name="plus" size={12} color={colors.primary} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}

                        <TextInput placeholder="Примечание к заказу..." placeholderTextColor={colors.mutedForeground} value={orderNote} onChangeText={setOrderNote} style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10, marginTop: 8 }]} />
                      </ScrollView>

                      {/* Cart summary + submit */}
                      <View style={[styles.cartSummary, { borderTopColor: colors.border }]}>
                        <View>
                          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>{cart.length} позиций в корзине</Text>
                          <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
                            {cart.reduce((s,c) => s + c.qty*c.price, 0).toLocaleString()} TJS
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            if (!orderClient.name && !orderClient.id) { Alert.alert("Ошибка","Выберите клиента"); return; }
                            if (cart.length === 0) { Alert.alert("Ошибка","Добавьте хотя бы один товар"); return; }
                            createOrder.mutate({ client_id: orderClient.id, client_name: orderClient.name, manager_id: user?.id, note: orderNote, items: cart });
                          }}
                          style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1, marginLeft: 12 }]}
                          disabled={createOrder.isPending}
                        >
                          {createOrder.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Оформить заказ</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </KeyboardAvoidingView>
                </View>
              </Modal>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  Все: "Все", new: "Новый", confirmed: "Подтверждён", in_production: "В работе",
  shipped: "Отгружен", delivered: "Доставлен", cancelled: "Отменён",
};
const ORDER_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  new:           { bg: "#3498db20", text: "#3498db" },
  confirmed:     { bg: "#27ae6020", text: "#27ae60" },
  in_production: { bg: "#f39c1220", text: "#f39c12" },
  shipped:       { bg: "#9b59b620", text: "#9b59b6" },
  delivered:     { bg: "#1abc9c20", text: "#1abc9c" },
  cancelled:     { bg: "#e74c3c20", text: "#e74c3c" },
};

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
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  tagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  // ── Route ──
  filterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomWidth: 1 },
  dateArrow: { padding: 4 },
  dateText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  todayBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  addBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  routeCard: { padding: 14, gap: 0, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  routeHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  routeTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  routeSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  stopRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1 },
  stopDot: { width: 10, height: 10, borderRadius: 5 },
  stopName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  stopAddr: { fontSize: 11, fontFamily: "Inter_400Regular" },
  visitBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  // ── Clients ──
  searchBox: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", padding: 0 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center" },
  catChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  clientCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  clientIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  clientName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  clientSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  clientDetailCard: { padding: 20, alignItems: "center", gap: 8, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, marginBottom: 12 },
  clientAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  clientDetailName: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  clientDetailRow: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%" },
  clientDetailVal: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  // ── Orders ──
  orderCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, gap: 8 },
  orderCardFull: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, overflow: "hidden" },
  orderCardHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 8 },
  orderNum: { fontSize: 12, fontFamily: "Inter_700Bold" },
  orderTotal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  productRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  productName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  productCat: { fontSize: 11, fontFamily: "Inter_400Regular" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  qtyVal: { fontSize: 14, fontFamily: "Inter_700Bold", minWidth: 18, textAlign: "center" },
  // ── Modals ──
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%", gap: 0 },
  modalBoxLg: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalInput: { padding: 12, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 10 },
  primaryBtn: { padding: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  cartSummary: { flexDirection: "row", alignItems: "center", paddingTop: 14, marginTop: 12, borderTopWidth: 1, gap: 0 },
});
