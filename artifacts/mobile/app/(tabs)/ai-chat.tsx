import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { apiPost } from "@/constants/api";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

const WELCOME = "Привет! Я AI-Агент Пойтахт, работающий на **Gemini 2.5 Flash** 🤖\n\nУ меня есть прямой доступ к актуальным данным компании:\n• Дебиторы и задолженности\n• Складские остатки\n• Задачи и посещаемость\n• Продажи и планы\n\nЗадайте любой вопрос — я дам ответ с реальными цифрами!";

const SUGGESTIONS = [
  "Дай сводный отчёт по компании",
  "Какие срочные действия нужны сейчас?",
  "Кто самый проблемный дебитор?",
  "Что нужно срочно закупить на склад?",
  "Анализ выполнения плана продаж",
  "Сколько задач просрочено и у кого?",
  "Посещаемость и дисциплина команды",
  "Топ рисков для бизнеса сегодня",
];

export default function AiChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "assistant", text: WELCOME, timestamp: new Date() },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 60;

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, isLoading]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;
    setError(null);
    const userMsg: Message = { id: Date.now(), role: "user", text: text.trim(), timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      // Отправляем историю на бекенд (последние 10 сообщений для контекста)
      const history = newMessages.slice(-10).map((m) => ({
        role: m.role,
        content: m.text,
      }));
      const data = await apiPost<{ response: string; model: string }>("/api/ai-chat", {
        messages: history,
      });
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: "assistant",
        text: data.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e: any) {
      setError("Не удалось получить ответ. Проверьте подключение к серверу.");
    } finally {
      setIsLoading(false);
    }
  }

  function clearChat() {
    setMessages([{ id: 0, role: "assistant", text: WELCOME, timestamp: new Date() }]);
    setError(null);
  }

  function renderText(text: string) {
    return text.split("\n").map((line, i) => {
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
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
          <Feather name="cpu" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>AI Агент</Text>
          <View style={styles.modelRow}>
            <View style={[styles.onlineDot, { backgroundColor: isLoading ? colors.warning : colors.success }]} />
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {isLoading ? "Анализирует данные..." : "Gemini 2.5 Flash · Данные компании"}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={clearChat} style={[styles.clearBtn, { backgroundColor: colors.muted, borderRadius: 100 }]}>
          <Feather name="trash-2" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.messageList, { paddingBottom: bottomPad + 110 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        {messages.map((msg) => (
          <View key={msg.id} style={[styles.msgRow, msg.role === "user" && styles.msgRowUser]}>
            {msg.role === "assistant" && (
              <View style={[styles.msgAvatar, { backgroundColor: colors.primary }]}>
                <Feather name="cpu" size={14} color="#fff" />
              </View>
            )}
            <View style={[
              styles.bubble,
              msg.role === "assistant"
                ? { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
                : { backgroundColor: colors.primary },
              { borderRadius: colors.radius, maxWidth: "84%" },
            ]}>
              <Text style={[styles.bubbleText, { color: msg.role === "assistant" ? colors.foreground : "#fff" }]}>
                {msg.role === "assistant" ? renderText(msg.text) : msg.text}
              </Text>
              <Text style={[styles.timestamp, { color: msg.role === "assistant" ? colors.mutedForeground : "rgba(255,255,255,0.6)" }]}>
                {msg.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          </View>
        ))}

        {isLoading && (
          <View style={styles.msgRow}>
            <View style={[styles.msgAvatar, { backgroundColor: colors.primary }]}>
              <Feather name="cpu" size={14} color="#fff" />
            </View>
            <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius }]}>
              <View style={styles.thinkingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.thinkingText, { color: colors.mutedForeground }]}>Анализирую данные компании...</Text>
              </View>
            </View>
          </View>
        )}

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.danger + "15", borderColor: colors.danger + "40", borderRadius: colors.radius }]}>
            <Feather name="alert-circle" size={16} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger, flex: 1 }]}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <Feather name="x" size={14} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}

        {/* Quick suggestions (only when few messages) */}
        {messages.length <= 1 && (
          <View style={styles.suggestions}>
            <Text style={[styles.suggestTitle, { color: colors.mutedForeground }]}>Быстрые вопросы:</Text>
            <View style={styles.suggestionGrid}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => sendMessage(s)}
                  disabled={isLoading}
                  style={[styles.suggestionBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius / 2 }]}
                >
                  <Text style={[styles.suggestionText, { color: colors.foreground }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={[styles.inputArea, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad }]}>
        {messages.length > 3 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingBottom: 8 }}>
            {["Сводный отчёт", "Срочные действия", "Дебиторы", "Склад", "Продажи"].map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => sendMessage(s)}
                disabled={isLoading}
                style={[styles.quickChip, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40", borderRadius: 100 }]}
              >
                <Text style={[styles.quickText, { color: colors.primary }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <View style={[styles.inputRow, { backgroundColor: colors.muted, borderRadius: 24 }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Спросите о данных компании..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            multiline
            maxLength={1000}
            onSubmitEditing={() => sendMessage(input)}
            returnKeyType="send"
            blurOnSubmit
            editable={!isLoading}
          />
          <TouchableOpacity
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            style={[styles.sendBtn, { backgroundColor: input.trim() && !isLoading ? colors.primary : colors.border }]}
          >
            {isLoading ? (
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
  aiAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modelRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  clearBtn: { padding: 9 },
  messageList: { padding: 12, gap: 14 },
  msgRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  msgRowUser: { flexDirection: "row-reverse" },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  bubble: { padding: 12, gap: 4 },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  timestamp: { fontSize: 10, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  thinkingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderWidth: 1, marginTop: 4 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  suggestions: { gap: 10, marginTop: 4 },
  suggestTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", paddingHorizontal: 2 },
  suggestionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestionBtn: { paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1 },
  suggestionText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputArea: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 10 },
  quickRow: { flexGrow: 0, marginBottom: 2 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  quickText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", paddingLeft: 16, paddingRight: 6, paddingVertical: 6, gap: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 100, paddingVertical: 4 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
