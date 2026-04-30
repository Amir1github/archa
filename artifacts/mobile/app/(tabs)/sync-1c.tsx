import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch, RefreshControl,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost, apiPut } from "@/constants/api";

interface SyncLog {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "partial" | "error";
  modules: string;
  errors: string;
  records: number;
  triggered: string;
}
interface SyncStatus {
  last_sync: string | null;
  onec_configured: boolean;
  onec_url: string;
  onec_url_display: string;
  onec_user: string;
  sync_interval: number;
  is_running: boolean;
  logs: SyncLog[];
}

const STATUS_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  running: { bg: "#3498db20", text: "#3498db", label: "Выполняется" },
  success: { bg: "#27ae6020", text: "#27ae60", label: "Успешно" },
  partial: { bg: "#f39c1220", text: "#f39c12", label: "Частично" },
  error:   { bg: "#e74c3c20", text: "#e74c3c", label: "Ошибка" },
};

const MODULE_ICONS: Record<string, string> = {
  "Дебиторы":     "dollar-sign",
  "Склад":        "package",
  "Клиенты":      "users",
  "Сотрудники":   "user",
  "Продажи":      "trending-up",
  "История":      "clock",
};

export default function Sync1cScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const topPad = Math.max(insets.top, 16);

  const [showConfig, setShowConfig] = useState(false);
  const [cfgUrl,  setCfgUrl]  = useState("");
  const [cfgUser, setCfgUser] = useState("Администратор");
  const [cfgPass, setCfgPass] = useState("");
  const [cfgInterval, setCfgInterval] = useState("600");
  const [testResult, setTestResult] = useState<{ok: boolean; message: string} | null>(null);
  const [showPass, setShowPass] = useState(false);

  const { data: status, isLoading, refetch, isRefetching } = useQuery<SyncStatus>({
    queryKey: ["sync-status"],
    queryFn: () => apiGet("/api/sync/status"),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const runSync = useMutation({
    mutationFn: () => apiPost("/api/sync/1c", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      Alert.alert("Синхронизация запущена", "Данные загружаются из 1С. Это займёт несколько секунд.");
    },
    onError: () => Alert.alert("Ошибка", "Не удалось запустить синхронизацию"),
  });

  const testConn = useMutation({
    mutationFn: () => apiPost("/api/sync/1c/test", { url: cfgUrl, user: cfgUser, password: cfgPass }),
    onSuccess: (data: any) => setTestResult(data),
    onError: () => setTestResult({ ok: false, message: "Ошибка запроса" }),
  });

  const saveConfig = useMutation({
    mutationFn: () => apiPut("/api/sync/1c/config", {
      url: cfgUrl, user: cfgUser, password: cfgPass,
      interval: Number(cfgInterval) || 600,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      setShowConfig(false);
      Alert.alert("Сохранено", "Настройки 1С сохранены");
    },
    onError: () => Alert.alert("Ошибка", "Не удалось сохранить настройки"),
  });

  const openConfig = () => {
    setCfgUrl(status?.onec_url || "");
    setCfgUser(status?.onec_user || "Администратор");
    setCfgPass("");
    setCfgInterval(String(status?.sync_interval || 600));
    setTestResult(null);
    setShowConfig(true);
  };

  const configured = status?.onec_configured;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[s.title, { color: colors.foreground }]}>Интеграция 1С</Text>
        <TouchableOpacity onPress={openConfig} style={[s.settingsBtn, { backgroundColor: colors.muted, borderRadius: 10 }]}>
          <Feather name="settings" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {/* ── Статус подключения ── */}
        <View style={[s.card, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
          <View style={s.cardRow}>
            <View style={[s.iconBox, { backgroundColor: configured ? colors.success + "20" : colors.danger + "20" }]}>
              <Feather name={configured ? "check-circle" : "x-circle"} size={22}
                color={configured ? colors.success : colors.danger} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.cardTitle, { color: colors.foreground }]}>
                {configured ? "Подключено к 1С" : "1С не настроена"}
              </Text>
              {configured ? (
                <Text style={[s.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {status?.onec_url_display || status?.onec_url}
                </Text>
              ) : (
                <Text style={[s.cardSub, { color: colors.mutedForeground }]}>
                  Нажмите «Настроить», чтобы добавить данные 1С
                </Text>
              )}
            </View>
          </View>

          {configured && (
            <View style={[s.divider, { borderTopColor: colors.border }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
                <View style={{ gap: 2 }}>
                  <Text style={[s.metaLabel, { color: colors.mutedForeground }]}>Последняя синхронизация</Text>
                  <Text style={[s.metaVal, { color: colors.foreground }]}>{status?.last_sync || "Ещё не выполнялась"}</Text>
                </View>
                <View style={{ gap: 2, alignItems: "flex-end" }}>
                  <Text style={[s.metaLabel, { color: colors.mutedForeground }]}>Интервал авто</Text>
                  <Text style={[s.metaVal, { color: colors.foreground }]}>
                    {Math.floor((status?.sync_interval || 600) / 60)} мин
                  </Text>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={configured ? () => runSync.mutate() : openConfig}
            disabled={runSync.isPending || status?.is_running}
            style={[s.primaryBtn, { backgroundColor: colors.primary, marginTop: 14, borderRadius: 12 }]}
          >
            {runSync.isPending || status?.is_running ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={s.primaryBtnText}>Синхронизация...</Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name={configured ? "refresh-cw" : "settings"} size={16} color="#fff" />
                <Text style={s.primaryBtnText}>{configured ? "Синхронизировать сейчас" : "Настроить 1С"}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Что синхронизируется ── */}
        <View style={[s.card, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>Что синхронизируется</Text>
          {[
            ["Дебиторы", "Контрагенты с задолженностями, суммы, сроки"],
            ["Склад",    "Номенклатура, остатки, цены"],
            ["Клиенты",  "База контрагентов (розница, опт, VIP)"],
            ["Сотрудники","Список персонала, зарплаты"],
            ["Продажи",  "Факт/план продаж по менеджерам"],
            ["История",  "Данные продаж за прошлые периоды"],
          ].map(([mod, desc]) => (
            <View key={mod} style={[s.moduleRow, { borderBottomColor: colors.border }]}>
              <View style={[s.moduleIcon, { backgroundColor: colors.primary + "15", borderRadius: 8 }]}>
                <Feather name={(MODULE_ICONS[mod] || "database") as any} size={15} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.moduleName, { color: colors.foreground }]}>{mod}</Text>
                <Text style={[s.moduleSub, { color: colors.mutedForeground }]}>{desc}</Text>
              </View>
              <View style={[s.dirBadge, { backgroundColor: colors.muted, borderRadius: 8 }]}>
                <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>1С→Платф.</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Журнал синхронизаций ── */}
        {(status?.logs?.length || 0) > 0 && (
          <View style={[s.card, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>История синхронизаций</Text>
            {status!.logs.map((log) => {
              const sc = STATUS_COLOR[log.status] || STATUS_COLOR.error;
              const mods = log.modules ? log.modules.split(", ") : [];
              return (
                <View key={log.id} style={[s.logRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[s.logBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[s.logBadgeText, { color: sc.text }]}>{sc.label}</Text>
                      </View>
                      <Text style={[s.logTime, { color: colors.mutedForeground }]}>
                        {log.started_at?.slice(0, 16).replace("T", " ")}
                        {log.triggered === "manual" ? " · вручную" : ""}
                      </Text>
                    </View>
                    {mods.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                        {mods.map((m, i) => (
                          <View key={i} style={[s.modChip, { backgroundColor: colors.muted, borderRadius: 6 }]}>
                            <Text style={{ fontSize: 10, color: colors.foreground, fontFamily: "Inter_500Medium" }}>{m}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {!!log.errors && (
                      <Text style={[s.logError, { color: colors.danger }]} numberOfLines={2}>
                        ⚠ {log.errors}
                      </Text>
                    )}
                    {log.records > 0 && (
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                        Записей обработано: {log.records}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Инструкция для 1С ── */}
        <View style={[s.card, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>Инструкция по настройке 1С</Text>
          {[
            ["1", "Откройте 1С:Предприятие 8.3 (Торговля или ERP)"],
            ["2", "Перейдите в «Администрирование» → «HTTP-сервисы»"],
            ["3", "Создайте HTTP-сервис с корневым URL, например: /poytakht"],
            ["4", "Добавьте методы: /debtors/list, /warehouse/remains, /counterparties/list, /employees/list, /sales/planfact, /sales/history, /ping"],
            ["5", "Включите базовую HTTP-аутентификацию"],
            ["6", "Укажите URL и учётные данные в настройках ниже"],
          ].map(([num, text]) => (
            <View key={num} style={{ flexDirection: "row", gap: 12, marginBottom: 10 }}>
              <View style={[s.stepNum, { backgroundColor: colors.primary + "20", borderRadius: 20 }]}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 }}>{num}</Text>
              </View>
              <Text style={{ flex: 1, color: colors.foreground, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 }}>{text}</Text>
            </View>
          ))}
          <View style={[{ backgroundColor: colors.muted, borderRadius: 10, padding: 12, marginTop: 4 }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 }}>
              💡 Если нужна помощь в написании HTTP-сервиса для 1С — обратитесь к вашему 1С-специалисту. Мы предоставляем пример кода по запросу.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Модал настройки ── */}
      {showConfig && (
        <View style={[StyleSheet.absoluteFill, s.overlay]}>
          <View style={[s.modal, { backgroundColor: colors.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>Настройка 1С</Text>
              <TouchableOpacity onPress={() => setShowConfig(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>URL HTTP-сервиса 1С</Text>
              <TextInput
                value={cfgUrl}
                onChangeText={setCfgUrl}
                placeholder="http://192.168.1.100/poytakht/hs/api"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                style={[s.input, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10 }]}
              />

              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Логин 1С</Text>
              <TextInput
                value={cfgUser}
                onChangeText={setCfgUser}
                placeholder="Администратор"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                style={[s.input, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 10 }]}
              />

              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Пароль 1С</Text>
              <View style={[s.input, s.passRow, { backgroundColor: colors.muted, borderRadius: 10 }]}>
                <TextInput
                  value={cfgPass}
                  onChangeText={setCfgPass}
                  placeholder="Пароль"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14, padding: 0 }}
                />
                <TouchableOpacity onPress={() => setShowPass(p => !p)}>
                  <Feather name={showPass ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Интервал авто-синхронизации</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                {[["5 мин","300"],["10 мин","600"],["30 мин","1800"],["1 час","3600"]].map(([label, val]) => (
                  <TouchableOpacity key={val} onPress={() => setCfgInterval(val)}
                    style={[s.intervalBtn, { backgroundColor: cfgInterval === val ? colors.primary : colors.muted, borderRadius: 8, flex: 1 }]}>
                    <Text style={{ textAlign:"center", fontSize: 11, fontFamily: "Inter_600SemiBold", color: cfgInterval === val ? "#fff" : colors.mutedForeground }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Тест подключения */}
              <TouchableOpacity
                onPress={() => { setTestResult(null); testConn.mutate(); }}
                disabled={testConn.isPending || !cfgUrl}
                style={[s.testBtn, { backgroundColor: colors.muted, borderRadius: 10, borderColor: colors.border }]}
              >
                {testConn.isPending ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="zap" size={15} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Проверить подключение</Text>
                  </View>
                )}
              </TouchableOpacity>

              {testResult && (
                <View style={[s.testResult, { backgroundColor: testResult.ok ? colors.success+"15" : colors.danger+"15", borderRadius: 10, borderColor: testResult.ok ? colors.success : colors.danger }]}>
                  <Feather name={testResult.ok ? "check-circle" : "x-circle"} size={16} color={testResult.ok ? colors.success : colors.danger} />
                  <Text style={{ flex: 1, color: testResult.ok ? colors.success : colors.danger, fontSize: 12, fontFamily: "Inter_500Medium" }}>
                    {testResult.message}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                onPress={() => { if (!cfgUrl.trim()) { Alert.alert("Ошибка", "Укажите URL 1С"); return; } saveConfig.mutate(); }}
                disabled={saveConfig.isPending}
                style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
              >
                {saveConfig.isPending ? <ActivityIndicator color="#fff" size="small" /> :
                  <Text style={s.primaryBtnText}>Сохранить настройки</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  settingsBtn: { padding: 8 },
  content: { padding: 12, gap: 12 },
  card: { padding: 16, gap: 0, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  divider: { borderTopWidth: 1, marginTop: 12 },
  metaLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  metaVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  primaryBtn: { padding: 14, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },
  moduleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  moduleIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  moduleName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  moduleSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  dirBadge: { paddingHorizontal: 8, paddingVertical: 4 },
  logRow: { paddingVertical: 12, borderBottomWidth: 1, gap: 0 },
  logBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  logBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  logTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  modChip: { paddingHorizontal: 6, paddingVertical: 2 },
  logError: { fontSize: 11, fontFamily: "Inter_400Regular" },
  stepNum: { width: 26, height: 26, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  overlay: { backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  input: { padding: 13, fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 14 },
  passRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 13 },
  intervalBtn: { paddingVertical: 9 },
  testBtn: { padding: 13, alignItems: "center", borderWidth: 1, marginBottom: 12, flexDirection: "row", justifyContent: "center" },
  testResult: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderWidth: 1, marginBottom: 14 },
  saveBtn: { padding: 14, alignItems: "center", marginTop: 4 },
});
