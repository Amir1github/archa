import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/constants/api";
import type { Debtor, Employee, Task } from "@/types";

interface WarehouseItem { id: number; name: string; qty: number; min_qty: number; category: string; unit: string; }
interface SalesFact { manager_id: number; period: string; amount: number; }
interface SalesPlan { manager_id: number; period: string; amount: number; }
interface Attendance { emp_id: number; status: string; }

interface Message { id: number; role: "user" | "assistant"; text: string; timestamp: Date; }

function getTodayISO() { return new Date().toISOString().split("T")[0]; }

const SUGGESTIONS = [
  "Какой общий долг у дебиторов?",
  "Кто самый проблемный дебитор?",
  "Что заканчивается на складе?",
  "Сколько задач просрочено?",
  "Кто опаздывает чаще всего?",
  "Выполнение плана продаж?",
  "Дай сводный отчёт по компании",
  "Какие срочные действия нужны?",
];

export default function AiChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      text: "Привет! Я AI-Агент Пойтахт 👋\n\nУ меня есть доступ ко всем данным компании: дебиторы, склад, задачи, продажи, посещаемость, сотрудники.\n\nЗадайте любой вопрос или выберите подсказку ниже.",
      timestamp: new Date(),
    },
  ]);
  const [isThinking, setIsThinking] = useState(false);

  const { data: debtors = [] } = useQuery<Debtor[]>({ queryKey: ["debtors"], queryFn: () => apiGet("/api/debtors") });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["employees"], queryFn: () => apiGet("/api/employees") });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => apiGet("/api/tasks") });
  const { data: warehouse = [] } = useQuery<WarehouseItem[]>({ queryKey: ["warehouse"], queryFn: () => apiGet("/api/warehouse") });
  const { data: facts = [] } = useQuery<SalesFact[]>({ queryKey: ["sales-facts"], queryFn: () => apiGet("/api/sales/facts") });
  const { data: plans = [] } = useQuery<SalesPlan[]>({ queryKey: ["sales-plans"], queryFn: () => apiGet("/api/sales/plans") });
  const { data: attendance = [] } = useQuery<Attendance[]>({
    queryKey: ["attendance", getTodayISO()],
    queryFn: () => apiGet(`/api/attendance?date=${getTodayISO()}`),
  });

  const empMap = useMemo(() => {
    const m: Record<number, Employee> = {};
    employees.forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const dataReady = debtors.length > 0 || employees.length > 0 || tasks.length > 0;

  function analyzeQuestion(q: string): string {
    const low = q.toLowerCase();

    // Debtors analysis
    if (low.includes("дебитор") || low.includes("долг") || low.includes("задолженност")) {
      const active = debtors.filter((d) => d.status !== "paid");
      const total = active.reduce((s, d) => s + d.debt, 0);
      const critical = active.filter((d) => d.overdue_days > 90);
      const noContact = active.filter((d) => (d.comments || []).length === 0);
      const top3 = [...active].sort((a, b) => b.debt - a.debt).slice(0, 3);

      if (low.includes("самый") || low.includes("топ") || low.includes("кто")) {
        const top = active.sort((a, b) => b.debt - a.debt)[0];
        if (!top) return "Нет активных дебиторов.";
        return `🔴 Самый крупный дебитор:\n\n**${top.name}**\nДолг: ${top.debt.toFixed(1)} млн сум\nПросрочка: ${top.overdue_days} дней\nСтатус: ${top.status}\n\nВсего активных дебиторов: ${active.length}\nОбщий долг: ${total.toFixed(1)} млн сум`;
      }

      let resp = `📊 **Анализ дебиторской задолженности:**\n\n`;
      resp += `• Всего активных: ${active.length} клиентов\n`;
      resp += `• Общий долг: **${total.toFixed(1)} млн сум**\n`;
      resp += `• Критических (>90 дней): ${critical.length} клиентов\n`;
      resp += `• Без комментариев: ${noContact.length} клиентов\n\n`;
      resp += `**Топ-3 должника:**\n`;
      top3.forEach((d, i) => {
        resp += `${i + 1}. ${d.name} — ${d.debt.toFixed(1)} млн (${d.overdue_days}д)\n`;
      });
      if (critical.length > 0) {
        resp += `\n⚠️ **Рекомендация:** ${critical.length} клиентов требуют немедленной правовой реакции. Передайте в юротдел.`;
      }
      return resp;
    }

    // Warehouse analysis
    if (low.includes("склад") || low.includes("остаток") || low.includes("товар") || low.includes("заканчивает")) {
      const outOfStock = warehouse.filter((w) => w.qty === 0);
      const lowStock = warehouse.filter((w) => w.qty > 0 && w.qty <= w.min_qty);
      const ok = warehouse.filter((w) => w.qty > w.min_qty);
      const categories = [...new Set(warehouse.map((w) => w.category))];

      let resp = `📦 **Анализ склада:**\n\n`;
      resp += `• Всего позиций: ${warehouse.length}\n`;
      resp += `• Нет в наличии: **${outOfStock.length}** позиций\n`;
      resp += `• Заканчивается: **${lowStock.length}** позиций\n`;
      resp += `• В норме: ${ok.length} позиций\n`;
      resp += `• Категорий: ${categories.length}\n\n`;
      if (outOfStock.length > 0) {
        resp += `🔴 **Срочно закупить:**\n`;
        outOfStock.slice(0, 5).forEach((w) => resp += `• ${w.name} (${w.category})\n`);
      }
      if (lowStock.length > 0) {
        resp += `\n🟡 **Низкий остаток:**\n`;
        lowStock.slice(0, 5).forEach((w) => resp += `• ${w.name}: ${w.qty}/${w.min_qty} ${w.unit}\n`);
      }
      if (outOfStock.length === 0 && lowStock.length === 0) {
        resp += `✅ Склад в хорошем состоянии. Все позиции в норме.`;
      }
      return resp;
    }

    // Tasks analysis
    if (low.includes("задач") || low.includes("задани") || low.includes("просрочен") || low.includes("поручен")) {
      const overdue = tasks.filter((t) => t.status === "overdue" || (t.due_date && new Date(t.due_date) < new Date() && t.status !== "done"));
      const done = tasks.filter((t) => t.status === "done");
      const inProgress = tasks.filter((t) => t.status === "wip" || t.status === "in_progress");
      const blocked = tasks.filter((t) => t.status === "blocked");

      let resp = `✅ **Анализ задач:**\n\n`;
      resp += `• Всего задач: ${tasks.length}\n`;
      resp += `• Выполнено: ${done.length}\n`;
      resp += `• В работе: ${inProgress.length}\n`;
      resp += `• Заблокировано: ${blocked.length}\n`;
      resp += `• Просрочено: **${overdue.length}**\n\n`;
      if (overdue.length > 0) {
        resp += `🔴 **Просроченные задачи:**\n`;
        overdue.slice(0, 5).forEach((t) => {
          const emp = empMap[t.assignee_id];
          resp += `• ${t.title} → ${emp?.name || "не назначен"}\n`;
        });
        resp += `\n⚠️ Рекомендация: проведите ревью с командой.`;
      }
      return resp;
    }

    // Attendance analysis
    if (low.includes("посещаем") || low.includes("опаздыва") || low.includes("приход") || low.includes("сегодня") || low.includes("табель")) {
      const present = attendance.filter((a) => a.status === "present").length;
      const late = attendance.filter((a) => a.status === "late").length;
      const absent = attendance.filter((a) => a.status === "absent").length;
      const total = employees.length;

      let resp = `🕐 **Посещаемость сегодня:**\n\n`;
      resp += `• Сотрудников всего: ${total}\n`;
      resp += `• На работе: **${present}**\n`;
      resp += `• Опоздали: ${late}\n`;
      resp += `• Отсутствуют: ${absent}\n`;
      resp += `• Нет данных: ${Math.max(0, total - attendance.length)}\n\n`;
      const presentPct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
      resp += `Явка: **${presentPct}%**\n`;
      if (presentPct < 80) {
        resp += `\n⚠️ Низкая явка. Рекомендуется связаться с отсутствующими.`;
      } else {
        resp += `\n✅ Хорошая явка.`;
      }
      return resp;
    }

    // Sales analysis
    if (low.includes("продаж") || low.includes("план") || low.includes("выполнени") || low.includes("выручк")) {
      const totalFact = facts.reduce((s, f) => s + f.amount, 0);
      const totalPlan = plans.filter((p) => p.period.startsWith("2026") && p.period.length === 7).reduce((s, p) => s + p.amount, 0);
      const overallPct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

      const mgrStats = employees.map((emp) => {
        const empFact = facts.filter((f) => f.manager_id === emp.id).reduce((s, f) => s + f.amount, 0);
        const empPlan = plans.filter((p) => p.manager_id === emp.id && p.period.startsWith("2026") && p.period.length === 7).reduce((s, p) => s + p.amount, 0);
        return { name: emp.name, fact: empFact, plan: empPlan, pct: empPlan > 0 ? Math.round((empFact / empPlan) * 100) : 0 };
      }).sort((a, b) => b.pct - a.pct);

      let resp = `📈 **Анализ продаж 2026:**\n\n`;
      resp += `• Факт: **${totalFact.toFixed(0)} млн сум**\n`;
      resp += `• План: ${totalPlan.toFixed(0)} млн сум\n`;
      resp += `• Выполнение: **${overallPct}%**\n\n`;
      resp += `**По менеджерам:**\n`;
      mgrStats.forEach((m) => {
        const icon = m.pct >= 100 ? "✅" : m.pct >= 70 ? "🟡" : "🔴";
        resp += `${icon} ${m.name}: ${m.pct}% (${m.fact.toFixed(0)}M / ${m.plan.toFixed(0)}M)\n`;
      });
      if (overallPct < 80) {
        resp += `\n⚠️ Выполнение ниже нормы. Рекомендую провести совещание с продажниками.`;
      }
      return resp;
    }

    // Employees
    if (low.includes("сотрудник") || low.includes("команд") || low.includes("персонал") || low.includes("зарплат")) {
      const dept: Record<string, number> = {};
      employees.forEach((e) => { const d = e.role || "Другое"; dept[d] = (dept[d] || 0) + 1; });
      const totalSalary = employees.reduce((s, e) => s + (e.salary || 0), 0);

      let resp = `👥 **Команда:**\n\n`;
      resp += `• Всего сотрудников: ${employees.length}\n`;
      resp += `• Фонд оплаты труда: ${(totalSalary / 1_000_000).toFixed(1)} млн сум/мес\n\n`;
      resp += `**По ролям:**\n`;
      Object.entries(dept).forEach(([role, count]) => {
        resp += `• ${role}: ${count}\n`;
      });
      return resp;
    }

    // General summary
    if (low.includes("сводн") || low.includes("отчёт") || low.includes("отчет") || low.includes("обзор") || low.includes("состояние")) {
      const activeDebtors = debtors.filter((d) => d.status !== "paid");
      const totalDebt = activeDebtors.reduce((s, d) => s + d.debt, 0);
      const criticalDebtors = activeDebtors.filter((d) => d.overdue_days > 90).length;
      const overdueTasks = tasks.filter((t) => t.status === "overdue").length;
      const outOfStock = warehouse.filter((w) => w.qty === 0).length;
      const lowStock = warehouse.filter((w) => w.qty > 0 && w.qty <= w.min_qty).length;
      const present = attendance.filter((a) => a.status === "present").length;
      const totalFact = facts.reduce((s, f) => s + f.amount, 0);
      const totalPlan = plans.filter((p) => p.period.startsWith("2026") && p.period.length === 7).reduce((s, p) => s + p.amount, 0);
      const salesPct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

      let resp = `🏢 **Сводный отчёт "Пойтахт"**\n📅 ${new Date().toLocaleDateString("ru-RU")}\n\n`;
      resp += `**📋 Задачи:** ${tasks.length} всего | ${overdueTasks > 0 ? `🔴 ${overdueTasks} просрочено` : "✅ без просрочек"}\n\n`;
      resp += `**💰 Дебиторы:** ${activeDebtors.length} клиентов | Долг: **${totalDebt.toFixed(1)} млн сум**\n`;
      if (criticalDebtors > 0) resp += `⚠️ Критических: ${criticalDebtors}\n`;
      resp += `\n**📦 Склад:** ${outOfStock + lowStock > 0 ? `🔴 ${outOfStock} нет в наличии, ${lowStock} заканчивается` : "✅ норма"}\n\n`;
      resp += `**🕐 Персонал:** ${present} из ${employees.length} на работе сегодня\n\n`;
      resp += `**📈 Продажи:** ${salesPct}% плана выполнено (${totalFact.toFixed(0)}M факт)\n\n`;

      const issues = [];
      if (overdueTasks > 0) issues.push(`${overdueTasks} просроченных задач`);
      if (criticalDebtors > 0) issues.push(`${criticalDebtors} критических дебиторов`);
      if (outOfStock > 0) issues.push(`${outOfStock} позиций нет на складе`);
      if (salesPct < 80 && salesPct > 0) issues.push(`выполнение плана продаж только ${salesPct}%`);

      if (issues.length > 0) {
        resp += `🚨 **Требует внимания:**\n`;
        issues.forEach((i) => resp += `• ${i}\n`);
      } else {
        resp += `✅ Все показатели в норме!`;
      }
      return resp;
    }

    // Urgent actions
    if (low.includes("срочно") || low.includes("действи") || low.includes("нужно") || low.includes("рекоменд")) {
      const urgentItems: string[] = [];
      debtors.filter((d) => d.overdue_days > 90 && d.status !== "paid").forEach((d) => {
        urgentItems.push(`🔴 [ДЕБИТОРЫ] ${d.name} — ${d.debt.toFixed(1)} млн (${d.overdue_days}д просрочки)`);
      });
      warehouse.filter((w) => w.qty === 0).forEach((w) => {
        urgentItems.push(`📦 [СКЛАД] Закупить: ${w.name} (${w.category})`);
      });
      tasks.filter((t) => t.status === "overdue" || t.priority === "high").slice(0, 3).forEach((t) => {
        const emp = empMap[t.assignee_id];
        urgentItems.push(`✅ [ЗАДАЧА] ${t.title} → ${emp?.name || "не назначен"}`);
      });

      if (urgentItems.length === 0) return "✅ Срочных действий нет. Все показатели в норме.";
      let resp = `⚡ **Срочные действия (${urgentItems.length}):**\n\n`;
      urgentItems.slice(0, 10).forEach((item) => resp += `${item}\n\n`);
      return resp;
    }

    // Help / default
    if (low.includes("помог") || low.includes("что умееш") || low.includes("помощ")) {
      return `Я могу помочь с:\n\n📊 **Анализом данных:**\n• Дебиторская задолженность\n• Складские остатки\n• Выполнение задач\n• Посещаемость\n• Продажи vs план\n• Сводные отчёты\n\n💡 **Рекомендациями:**\n• Срочные действия\n• Риски по клиентам\n• Приоритеты закупок\n\nПросто напишите вопрос!`;
    }

    return `🤔 Я не совсем понял вопрос. Попробуйте спросить про:\n• дебиторов (долги, клиентов)\n• склад (остатки, закупки)\n• задачи (просроченные, в работе)\n• продажи (план, выполнение)\n• посещаемость (явка, опоздания)\n• сводный отчёт по компании\n\nИли нажмите на подсказку ниже!`;
  }

  function sendMessage(text: string) {
    if (!text.trim() || isThinking) return;
    const userMsg: Message = { id: Date.now(), role: "user", text: text.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);
    setTimeout(() => {
      const answer = analyzeQuestion(text);
      const aiMsg: Message = { id: Date.now() + 1, role: "assistant", text: answer, timestamp: new Date() };
      setMessages((prev) => [...prev, aiMsg]);
      setIsThinking(false);
    }, 800 + Math.random() * 400);
  }

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, isThinking]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 60;

  function formatText(text: string) {
    return text.split("\n").map((line, i) => {
      const isBold = line.includes("**");
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <Text key={i} style={{ lineHeight: 22 }}>
          {parts.map((part, j) =>
            j % 2 === 1 ? (
              <Text key={j} style={{ fontFamily: "Inter_700Bold" }}>{part}</Text>
            ) : (
              <Text key={j}>{part}</Text>
            )
          )}
          {i < text.split("\n").length - 1 ? "\n" : ""}
        </Text>
      );
    });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.avatarAi, { backgroundColor: colors.primary }]}>
          <Feather name="cpu" size={20} color="#fff" />
        </View>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>AI Агент</Text>
          <Text style={[styles.subtitle, { color: dataReady ? colors.success : colors.mutedForeground }]}>
            {dataReady ? "● Онлайн · Данные загружены" : "○ Загрузка данных..."}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setMessages([{ id: 0, role: "assistant", text: "Привет! Я AI-Агент Пойтахт 👋\n\nУ меня есть доступ ко всем данным компании: дебиторы, склад, задачи, продажи, посещаемость, сотрудники.\n\nЗадайте любой вопрос или выберите подсказку ниже.", timestamp: new Date() }])}
          style={[styles.clearBtn, { backgroundColor: colors.muted, borderRadius: 100 }]}
        >
          <Feather name="trash-2" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.messageList, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        {messages.map((msg) => (
          <View key={msg.id} style={[styles.msgRow, msg.role === "user" && styles.msgRowUser]}>
            {msg.role === "assistant" && (
              <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
                <Feather name="cpu" size={14} color="#fff" />
              </View>
            )}
            <View style={[
              styles.bubble,
              msg.role === "assistant"
                ? { backgroundColor: colors.card, borderColor: colors.border }
                : { backgroundColor: colors.primary },
              { borderRadius: colors.radius, maxWidth: "82%" },
            ]}>
              <Text style={[styles.bubbleText, { color: msg.role === "assistant" ? colors.foreground : "#fff" }]}>
                {msg.role === "assistant" ? formatText(msg.text) : msg.text}
              </Text>
              <Text style={[styles.timestamp, { color: msg.role === "assistant" ? colors.mutedForeground : "rgba(255,255,255,0.6)" }]}>
                {msg.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          </View>
        ))}
        {isThinking && (
          <View style={styles.msgRow}>
            <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
              <Feather name="cpu" size={14} color="#fff" />
            </View>
            <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={styles.thinkingDots}>
                <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
                <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
                <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
              </View>
            </View>
          </View>
        )}

        {messages.length <= 2 && (
          <View style={styles.suggestions}>
            <Text style={[styles.suggestTitle, { color: colors.mutedForeground }]}>Быстрые вопросы:</Text>
            <View style={styles.suggestionGrid}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => sendMessage(s)}
                  style={[styles.suggestionBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius / 2 }]}
                >
                  <Text style={[styles.suggestionText, { color: colors.foreground }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.inputArea, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad }]}>
        <View style={[styles.inputRow, { backgroundColor: colors.muted, borderRadius: 24 }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Спросите о дебиторах, складе, продажах..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage(input)}
            returnKeyType="send"
            blurOnSubmit
          />
          <TouchableOpacity
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isThinking}
            style={[styles.sendBtn, { backgroundColor: input.trim() && !isThinking ? colors.primary : colors.muted }]}
          >
            {isThinking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={18} color={input.trim() ? "#fff" : colors.mutedForeground} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  avatarAi: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  clearBtn: { marginLeft: "auto", padding: 8 },
  messageList: { padding: 12, gap: 12 },
  msgRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  msgRowUser: { flexDirection: "row-reverse" },
  aiAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  bubble: { padding: 12, borderWidth: 1, gap: 4 },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  timestamp: { fontSize: 10, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  thinkingDots: { flexDirection: "row", gap: 4, alignItems: "center", paddingVertical: 4, paddingHorizontal: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, opacity: 0.5 },
  suggestions: { gap: 8, marginTop: 8 },
  suggestTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", paddingHorizontal: 4 },
  suggestionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  suggestionText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputArea: { borderTopWidth: 1, padding: 12 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", paddingLeft: 16, paddingRight: 6, paddingVertical: 6, gap: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 100, paddingVertical: 4 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
