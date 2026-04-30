import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Linking, Alert, TextInput,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";

import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost, apiPut, apiDelete } from "@/constants/api";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import type { Attendance, Employee } from "@/types";

function getTodayISO() { return new Date().toISOString().split("T")[0]; }

type Tab = "today" | "team" | "map" | "report" | "settings";

interface AttendanceReport {
  emp_id: number;
  total_days: number;
  present: number;
  late: number;
  absent: number;
  early_out: number;
  total_late_min: number;
  total_early_min: number;
}

interface Office {
  id: number; name: string; lat: number; lng: number; radius: number; active: number;
}

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [date, setDate] = useState(getTodayISO());

  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsResult, setGpsResult] = useState<{ action: "in"|"out"; distance_m: number; in_zone: boolean } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [newOfficeName, setNewOfficeName] = useState("");
  const [newOfficeLat, setNewOfficeLat] = useState("");
  const [newOfficeLng, setNewOfficeLng] = useState("");
  const [newOfficeRadius, setNewOfficeRadius] = useState("200");
  const [savingOffice, setSavingOffice] = useState(false);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [savingSettings, setSavingSettings] = useState(false);
  const geoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: attendance = [], isLoading: loadAtt, refetch } = useQuery<Attendance[]>({
    queryKey: ["attendance", date],
    queryFn: () => apiGet(`/api/attendance?date=${date}`),
    staleTime: 2 * 60 * 1000,
  });
  const { data: employees = [], isLoading: loadEmp } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
    staleTime: 10 * 60 * 1000,
  });
  const { data: report = [], isLoading: loadReport } = useQuery<AttendanceReport[]>({
    queryKey: ["attendance-report"],
    queryFn: () => apiGet("/api/attendance/report?period=month"),
    enabled: activeTab === "report" || activeTab === "team",
    staleTime: 5 * 60 * 1000,
  });
  const { data: offices = [], isLoading: loadOffices, refetch: refetchOffices } = useQuery<Office[]>({
    queryKey: ["offices"],
    queryFn: () => apiGet("/api/offices"),
    enabled: activeTab === "map" || activeTab === "settings",
    staleTime: 15 * 60 * 1000,
  });

  interface EmpLocation {
    emp_id: number; lat: number; lng: number; accuracy: number;
    updated_at: string; name: string; role: string; color: string; bg: string;
    distance_m: number; in_zone: boolean; seconds_ago: number; is_online: boolean;
  }
  const { data: empLocations = [], refetch: refetchGeo } = useQuery<EmpLocation[]>({
    queryKey: ["geo-all"],
    queryFn: () => apiGet("/api/geo/all"),
    enabled: activeTab === "map",
    refetchInterval: activeTab === "map" ? 15_000 : false,
    staleTime: 10_000,
  });

  const pushGeo = useCallback(async () => {
    if (!user) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await apiPost("/api/geo/update", {
        emp_id: user.id,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy || 0,
      });
    } catch { }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    pushGeo();
    geoIntervalRef.current = setInterval(pushGeo, 30_000);
    return () => { if (geoIntervalRef.current) clearInterval(geoIntervalRef.current); };
  }, [user, pushGeo]);

  const handleDeleteGeo = useCallback(async (empId: number, empName: string) => {
    Alert.alert("Удалить геолокацию?", empName, [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: async () => {
        await apiDelete(`/api/geo/${empId}`);
        refetchGeo();
      }},
    ]);
  }, [refetchGeo]);

  const myRecord = useMemo(() => {
    if (!user) return null;
    return attendance.find((a) => a.emp_id === user.id) || null;
  }, [attendance, user]);

  const handleCheckIn = useCallback(async () => {
    if (!user) return;
    setGpsLoading(true);
    setGpsError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGpsError("Разрешение на геолокацию не предоставлено");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const res = await apiPost("/api/attendance/checkin", {
        emp_id: user.id,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
      setGpsResult({ action: res.action, distance_m: res.distance_m, in_zone: res.in_zone });
      await refetch();
      qc.invalidateQueries({ queryKey: ["attendance-report"] });
    } catch (e: any) {
      setGpsError(e?.message || "Ошибка геолокации");
    } finally {
      setGpsLoading(false);
    }
  }, [user, refetch, qc]);

  const handleAddOffice = useCallback(async () => {
    if (!newOfficeName || !newOfficeLat || !newOfficeLng) {
      Alert.alert("Ошибка", "Заполните название и координаты офиса");
      return;
    }
    setSavingOffice(true);
    try {
      await apiPost("/api/offices", {
        name: newOfficeName,
        lat: parseFloat(newOfficeLat),
        lng: parseFloat(newOfficeLng),
        radius: parseInt(newOfficeRadius) || 200,
      });
      setNewOfficeName(""); setNewOfficeLat(""); setNewOfficeLng(""); setNewOfficeRadius("200");
      refetchOffices();
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось добавить офис");
    } finally {
      setSavingOffice(false);
    }
  }, [newOfficeName, newOfficeLat, newOfficeLng, newOfficeRadius, refetchOffices]);

  const handleDeleteOffice = useCallback(async (id: number, name: string) => {
    Alert.alert("Удалить офис?", name, [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: async () => {
        try {
          await apiDelete(`/api/offices/${id}`);
          refetchOffices();
        } catch {}
      }},
    ]);
  }, [refetchOffices]);

  const handleSaveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      await apiPut("/api/settings", { key: "work_start", value: workStart });
      await apiPut("/api/settings", { key: "work_end", value: workEnd });
      Alert.alert("Сохранено", "Настройки рабочего времени обновлены");
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось сохранить настройки");
    } finally {
      setSavingSettings(false);
    }
  }, [workStart, workEnd]);

  const handleGetMyLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setNewOfficeLat(loc.coords.latitude.toFixed(6));
      setNewOfficeLng(loc.coords.longitude.toFixed(6));
    } catch {}
  }, []);

  const empMap = useMemo(() => {
    const m: Record<number, Employee> = {};
    employees.forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const reportMap = useMemo(() => {
    const m: Record<number, AttendanceReport> = {};
    report.forEach((r) => (m[r.emp_id] = r));
    return m;
  }, [report]);

  const todayStats = useMemo(() => {
    const present = attendance.filter((a) => a.status === "present").length;
    const late = attendance.filter((a) => a.status === "late").length;
    const absent = attendance.filter((a) => a.status === "absent").length;
    const noData = Math.max(0, employees.length - attendance.length);
    return { present, late, absent, noData };
  }, [attendance, employees]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const isLoading = loadAtt || loadEmp;

  const buildLeafletHtml = useCallback((locs: typeof empLocations, offs: typeof offices): string => {
    const empMarkers = locs.map((loc) => {
      const color = loc.in_zone ? "#10b981" : (loc.is_online ? "#f59e0b" : "#9ca3af");
      const label = `${loc.name} (${loc.role})<br/>${loc.in_zone ? "✅ В офисе" : "❌ Не в офисе"}<br/>${loc.distance_m} м до офиса<br/>${loc.seconds_ago < 60 ? "только что" : `${Math.round(loc.seconds_ago / 60)} мин. назад`}`;
      return `L.circleMarker([${loc.lat}, ${loc.lng}], {radius:12, color:"${color}", fillColor:"${color}", fillOpacity:0.85, weight:2}).addTo(map).bindPopup("${label.replace(/"/g, "'")}").bindTooltip("${loc.name.split(" ")[0]}", {permanent:true, direction:"top", offset:[0,-8], className:"emp-label"})`;
    }).join(";\n");

    const offCircles = offs.map((o) =>
      `L.circle([${o.lat}, ${o.lng}], {radius:${o.radius}, color:"#3b82f6", fillColor:"#3b82f6", fillOpacity:0.08, weight:2, dashArray:"6"}).addTo(map).bindPopup("${o.name} · ${o.radius}м"); L.circleMarker([${o.lat}, ${o.lng}], {radius:8, color:"#3b82f6", fillColor:"#3b82f6", fillOpacity:1, weight:2}).addTo(map).bindTooltip("🏢 ${o.name}", {permanent:true, direction:"top", offset:[0,-8]})`
    ).join(";\n");

    const allLats = [...locs.map((l) => l.lat), ...offs.map((o) => o.lat)];
    const allLngs = [...locs.map((l) => l.lng), ...offs.map((o) => o.lng)];
    const centerLat = allLats.length ? allLats.reduce((a, b) => a + b, 0) / allLats.length : 38.5597;
    const centerLng = allLngs.length ? allLngs.reduce((a, b) => a + b, 0) / allLngs.length : 68.7738;

    return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%}
.emp-label{background:none;border:none;box-shadow:none;font-size:11px;font-weight:600;color:#111;white-space:nowrap}
</style></head><body>
<div id="map"></div>
<script>
var map = L.map('map').setView([${centerLat}, ${centerLng}], 15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM',maxZoom:19}).addTo(map);
${offCircles}
${empMarkers}
${allLats.length > 1 ? `try{map.fitBounds([[${Math.min(...allLats) - 0.002},${Math.min(...allLngs) - 0.002}],[${Math.max(...allLats) + 0.002},${Math.max(...allLngs) + 0.002}]])}catch(e){}` : ""}
</script></body></html>`;
  }, []);

  const leafletHtml = useMemo(() => buildLeafletHtml(empLocations, offices), [empLocations, offices, buildLeafletHtml]);

  const prevDay = () => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().split("T")[0]); };
  const nextDay = () => { const d = new Date(date); d.setDate(d.getDate() + 1); if (d <= new Date()) setDate(d.toISOString().split("T")[0]); };

  const TABS: [Tab, string, string][] = [
    ["today", "Сегодня", "clock"],
    ["team", "Команда", "users"],
    ["map", "Карта", "map-pin"],
    ["report", "Отчёт", "file-text"],
    ...(can("hr.manage") ? [["settings", "Настройки", "settings"] as [Tab, string, string]] : []),
  ];

  const isCheckedIn = !!myRecord?.time_in;
  const isCheckedOut = !!myRecord?.time_out;
  const checkInLabel = !isCheckedIn ? "Отметить приход" : !isCheckedOut ? "Отметить уход" : "Уже отмечен";
  const checkInDisabled = isCheckedOut || gpsLoading;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>HR / Табель</Text>
        <View style={styles.tabRow}>
          {TABS.map(([key, label, icon]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setActiveTab(key)}
              style={[styles.tab, activeTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Feather name={icon as any} size={13} color={activeTab === key ? colors.primary : colors.mutedForeground} style={{ marginRight: 4 }} />
              <Text style={[styles.tabText, { color: activeTab === key ? colors.primary : colors.mutedForeground }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === "today" && (
        <>
          {/* GPS Check-in Banner */}
          <View style={[styles.checkinBanner, { backgroundColor: isCheckedIn ? (isCheckedOut ? colors.muted : colors.success + "15") : colors.primary + "10", borderBottomColor: colors.border }]}>
            <View style={styles.checkinLeft}>
              <View style={[styles.checkinIcon, { backgroundColor: isCheckedIn ? (isCheckedOut ? colors.muted : colors.success + "25") : colors.primary + "20" }]}>
                <Feather name="map-pin" size={18} color={isCheckedIn ? (isCheckedOut ? colors.mutedForeground : colors.success) : colors.primary} />
              </View>
              <View>
                {myRecord?.time_in ? (
                  <>
                    <Text style={[styles.checkinStatus, { color: colors.foreground }]}>
                      Приход: {myRecord.time_in}{myRecord.time_out ? `  →  Уход: ${myRecord.time_out}` : ""}
                    </Text>
                    {gpsResult && (
                      <Text style={[styles.checkinSub, { color: gpsResult.in_zone ? colors.success : colors.warning }]}>
                        {gpsResult.in_zone ? "В зоне офиса" : `За зоной · ${gpsResult.distance_m} м`}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={[styles.checkinStatus, { color: colors.foreground }]}>GPS отметка прихода</Text>
                )}
                {gpsError && <Text style={[styles.checkinSub, { color: colors.danger }]}>{gpsError}</Text>}
              </View>
            </View>
            <TouchableOpacity
              onPress={handleCheckIn}
              disabled={checkInDisabled}
              style={[styles.checkinBtn, {
                backgroundColor: checkInDisabled ? colors.muted : isCheckedIn ? colors.warning : colors.primary,
                opacity: checkInDisabled ? 0.6 : 1,
              }]}
            >
              {gpsLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.checkinBtnText}>{checkInLabel}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <StatCard label="В офисе" value={todayStats.present} color={colors.success} />
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <StatCard label="Опоздали" value={todayStats.late} color={colors.warning} />
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <StatCard label="Нет данных" value={todayStats.noData} color={colors.mutedForeground} />
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <StatCard label="Ушли" value={todayStats.absent} color={colors.danger} />
          </View>

          <View style={[styles.dateNav, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={prevDay} style={styles.navBtn}>
              <Feather name="chevron-left" size={22} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.dateText, { color: colors.foreground }]}>
              {new Date(date).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
            </Text>
            <TouchableOpacity onPress={nextDay} style={styles.navBtn}>
              <Feather name="chevron-right" size={22} color={new Date(date).toDateString() === new Date().toDateString() ? colors.border : colors.primary} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : attendance.length === 0 ? (
            <>
              <EmptyState icon="calendar" title="Нет данных" subtitle="Данные о посещаемости за этот день отсутствуют" />
              {employees.length > 0 && (
                <View style={[styles.noDataList, { paddingHorizontal: 16 }]}>
                  {employees.map((emp) => (
                    <View key={emp.id} style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                      <View style={styles.cardLeft}>
                        <View style={[styles.avatar, { backgroundColor: emp.bg || colors.muted }]}>
                          <Text style={[styles.avatarText, { color: emp.color }]}>{emp.name.charAt(0)}</Text>
                        </View>
                        <View>
                          <Text style={[styles.empName, { color: colors.foreground }]}>{emp.name}</Text>
                          <Text style={[styles.empRole, { color: colors.mutedForeground }]}>{emp.role}</Text>
                        </View>
                      </View>
                      <View style={[styles.tag, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.tagText, { color: colors.mutedForeground }]}>Нет данных</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />} showsVerticalScrollIndicator={false}>
              {attendance.map((att) => {
                const emp = empMap[att.emp_id];
                if (!emp) return null;
                return (
                  <View key={att.id} style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                    <View style={styles.cardLeft}>
                      <View style={[styles.avatar, { backgroundColor: emp.bg || colors.muted }]}>
                        <Text style={[styles.avatarText, { color: emp.color }]}>{emp.name.charAt(0)}</Text>
                      </View>
                      <View style={styles.empInfo}>
                        <Text style={[styles.empName, { color: colors.foreground }]}>{emp.name}</Text>
                        <Text style={[styles.empRole, { color: colors.mutedForeground }]}>{emp.role}</Text>
                      </View>
                    </View>
                    <View style={styles.cardRight}>
                      <StatusBadge status={att.status} />
                      {att.time_in && (
                        <View style={styles.timeRow}>
                          <Feather name="log-in" size={12} color={colors.success} />
                          <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{att.time_in}</Text>
                          {att.time_out && (<><Feather name="log-out" size={12} color={colors.danger} /><Text style={[styles.timeText, { color: colors.mutedForeground }]}>{att.time_out}</Text></>)}
                        </View>
                      )}
                      {att.late_min > 0 && <Text style={[styles.lateText, { color: colors.danger }]}>+{att.late_min} мин.</Text>}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </>
      )}

      {activeTab === "team" && (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 4 }]}>Статистика за месяц</Text>
          {loadReport ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : employees.map((emp) => {
            const r = reportMap[emp.id];
            if (!r) return null;
            const attendancePct = r.total_days > 0 ? Math.round(((r.present + r.late) / r.total_days) * 100) : 0;
            return (
              <View key={emp.id} style={[styles.teamCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                <View style={styles.teamCardTop}>
                  <View style={[styles.avatar, { backgroundColor: emp.bg || colors.muted }]}>
                    <Text style={[styles.avatarText, { color: emp.color }]}>{emp.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.empName, { color: colors.foreground }]}>{emp.name}</Text>
                    <Text style={[styles.empRole, { color: colors.mutedForeground }]}>{emp.role}</Text>
                  </View>
                  <Text style={[styles.pctText, { color: attendancePct >= 80 ? colors.success : colors.warning }]}>{attendancePct}%</Text>
                </View>
                <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
                  <View style={[styles.progressFill, { width: `${attendancePct}%`, backgroundColor: attendancePct >= 80 ? colors.success : colors.warning }]} />
                </View>
                <View style={styles.teamStats}>
                  <MiniStat label="Присутствовал" value={r.present} color={colors.success} />
                  <MiniStat label="Опоздал" value={r.late} color={colors.warning} />
                  <MiniStat label="Отсутствовал" value={r.absent} color={colors.danger} />
                  <MiniStat label="Мин. опозд." value={r.total_late_min} color={colors.mutedForeground} suffix="м" />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {activeTab === "map" && (
        <View style={{ flex: 1 }}>
          {/* Leaflet map — full width on web, offline visual on mobile */}
          {Platform.OS === "web" ? (
            <View style={{ height: 340, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              {(loadOffices || offices.length === 0) ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }}>
                  {loadOffices ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.mutedForeground }}>Добавьте офис в Настройках</Text>}
                </View>
              ) : (
                <iframe
                  srcDoc={leafletHtml}
                  style={{ border: 0, width: "100%", height: "100%" }}
                  title="Карта сотрудников"
                />
              )}
              {/* Live refresh button */}
              <TouchableOpacity onPress={() => refetchGeo()}
                style={{ position: "absolute", bottom: 10, right: 10, backgroundColor: colors.card, borderRadius: 20, padding: 8, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, elevation: 4, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border }}>
                <Feather name="refresh-cw" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Обновить</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.muted, height: 180, alignItems: "center", justifyContent: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, paddingHorizontal: 16 }}>
                {offices.slice(0, 3).map((o) => (
                  <TouchableOpacity key={o.id} onPress={() => Linking.openURL(`https://maps.google.com/?q=${o.lat},${o.lng}`)}
                    style={{ backgroundColor: colors.primary + "15", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="map-pin" size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{o.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Нажмите на офис для открытия карты</Text>
            </View>
          )}

          {/* Summary stats row */}
          <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <StatCard label="В офисе" value={empLocations.filter((l) => l.in_zone).length} color={colors.success} />
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <StatCard label="Вне офиса" value={empLocations.filter((l) => !l.in_zone).length} color={colors.danger} />
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <StatCard label="Онлайн" value={empLocations.filter((l) => l.is_online).length} color={colors.primary} />
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <StatCard label="Всего" value={employees.length} color={colors.mutedForeground} />
          </View>

          {/* Employee geo list */}
          <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refetchGeo} />}
          >
            {employees.map((emp) => {
              const geo = empLocations.find((l) => l.emp_id === emp.id);
              const inZone = geo?.in_zone ?? false;
              const isOnline = geo?.is_online ?? false;
              const statusColor = !geo ? colors.mutedForeground : inZone ? colors.success : colors.danger;
              const statusLabel = !geo ? "Нет данных" : inZone ? "В офисе" : "Вне офиса";
              const secsAgo = geo?.seconds_ago ?? null;
              return (
                <View key={emp.id} style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow, borderLeftWidth: 3, borderLeftColor: statusColor }]}>
                  <View style={styles.cardLeft}>
                    <View style={{ position: "relative" }}>
                      <View style={[styles.avatar, { backgroundColor: emp.bg || colors.muted }]}>
                        <Text style={[styles.avatarText, { color: emp.color }]}>{emp.name.charAt(0)}</Text>
                      </View>
                      <View style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: isOnline ? colors.success : colors.mutedForeground, borderWidth: 1.5, borderColor: colors.card }} />
                    </View>
                    <View style={styles.empInfo}>
                      <Text style={[styles.empName, { color: colors.foreground }]}>{emp.name}</Text>
                      <Text style={[styles.empRole, { color: colors.mutedForeground }]}>{emp.role}</Text>
                      {geo && (
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                          {secsAgo !== null && secsAgo < 60 ? "только что" : secsAgo !== null ? `${Math.round(secsAgo / 60)} мин. назад` : ""} · {geo.distance_m} м
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View style={[styles.tag, { backgroundColor: statusColor + "20" }]}>
                      <Text style={[styles.tagText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                    {geo && can("hr.manage") && (
                      <TouchableOpacity onPress={() => handleDeleteGeo(emp.id, emp.name)}>
                        <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
            {empLocations.length === 0 && (
              <View style={{ paddingTop: 24, alignItems: "center", gap: 8 }}>
                <Feather name="wifi-off" size={36} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Геоданные пока не поступали</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center", paddingHorizontal: 32 }}>Данные появятся после того, как сотрудники откроют приложение</Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {activeTab === "settings" && (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
          {/* Work hours */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 8 }]}>Рабочее время</Text>
          <View style={[styles.settingsCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
            <View style={styles.settingsRow}>
              <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Начало работы</Text>
              <TextInput
                value={workStart}
                onChangeText={setWorkStart}
                style={[styles.settingsInput, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8 }]}
                placeholder="09:00"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={[styles.settingsDivider, { backgroundColor: colors.border }]} />
            <View style={styles.settingsRow}>
              <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Конец работы</Text>
              <TextInput
                value={workEnd}
                onChangeText={setWorkEnd}
                style={[styles.settingsInput, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8 }]}
                placeholder="18:00"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <TouchableOpacity
              onPress={handleSaveSettings}
              disabled={savingSettings}
              style={[styles.saveBtn2, { backgroundColor: colors.primary, borderRadius: colors.radius / 2 }]}
            >
              {savingSettings ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Сохранить время</Text>}
            </TouchableOpacity>
          </View>

          {/* Offices */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 12, marginBottom: 8 }]}>Офисы и геозоны</Text>
          {loadOffices ? <ActivityIndicator color={colors.primary} /> : offices.map((o) => (
            <View key={o.id} style={[styles.officeItemCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
              <View style={styles.officeItemLeft}>
                <View style={[styles.officeIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="map-pin" size={16} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.officeName, { color: colors.foreground }]}>{o.name}</Text>
                  <Text style={[styles.officeCoords, { color: colors.mutedForeground }]}>
                    {o.lat.toFixed(4)}, {o.lng.toFixed(4)} · {o.radius}м
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => handleDeleteOffice(o.id, o.name)} style={styles.delBtn}>
                <Feather name="trash-2" size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add office form */}
          <View style={[styles.settingsCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow, marginTop: 8 }]}>
            <Text style={[styles.officeName, { color: colors.foreground, marginBottom: 10 }]}>Добавить офис</Text>
            <TextInput
              value={newOfficeName}
              onChangeText={setNewOfficeName}
              placeholder="Название офиса"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.addInput, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8 }]}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={newOfficeLat}
                onChangeText={setNewOfficeLat}
                placeholder="Широта"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                style={[styles.addInput, { flex: 1, color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8 }]}
              />
              <TextInput
                value={newOfficeLng}
                onChangeText={setNewOfficeLng}
                placeholder="Долгота"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                style={[styles.addInput, { flex: 1, color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8 }]}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput
                value={newOfficeRadius}
                onChangeText={setNewOfficeRadius}
                placeholder="Радиус (м)"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                style={[styles.addInput, { flex: 1, color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8 }]}
              />
              <TouchableOpacity
                onPress={handleGetMyLocation}
                style={[styles.gpsBtn, { backgroundColor: colors.primary + "15", borderRadius: 8 }]}
              >
                <Feather name="crosshair" size={16} color={colors.primary} />
                <Text style={[styles.gpsBtnText, { color: colors.primary }]}>GPS</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleAddOffice}
              disabled={savingOffice}
              style={[styles.saveBtn2, { backgroundColor: colors.success, borderRadius: colors.radius / 2 }]}
            >
              {savingOffice ? <ActivityIndicator size="small" color="#fff" /> : (
                <><Feather name="plus" size={14} color="#fff" /><Text style={styles.saveBtnText}>Добавить офис</Text></>
              )}
            </TouchableOpacity>
          </View>

          {/* CSV Export */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 12, marginBottom: 8 }]}>Экспорт данных</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL("/api/export/csv?table=attendance")}
            style={[styles.exportBtnFull, { backgroundColor: colors.success + "15", borderColor: colors.success + "50", borderRadius: colors.radius }]}
          >
            <Feather name="download" size={16} color={colors.success} />
            <Text style={[styles.exportBtnText, { color: colors.success }]}>Скачать табель (CSV)</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeTab === "report" && (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 4 }]}>Месячный отчёт HR</Text>
          {loadReport ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
            <>
              <View style={[styles.reportSummary, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                <Text style={[styles.reportTitle, { color: colors.foreground }]}>Сводка за месяц</Text>
                <View style={styles.reportGrid}>
                  {[
                    { label: "Всего явок", value: report.reduce((s, r) => s + r.present, 0), color: colors.success },
                    { label: "Опозданий", value: report.reduce((s, r) => s + r.late, 0), color: colors.warning },
                    { label: "Пропусков", value: report.reduce((s, r) => s + r.absent, 0), color: colors.danger },
                    { label: "Раннее уход.", value: report.reduce((s, r) => s + r.early_out, 0), color: colors.mutedForeground },
                  ].map((item) => (
                    <View key={item.label} style={[styles.reportGridItem, { backgroundColor: colors.muted, borderRadius: colors.radius / 2 }]}>
                      <Text style={[styles.reportGridValue, { color: item.color }]}>{item.value}</Text>
                      <Text style={[styles.reportGridLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {employees.map((emp) => {
                const r = reportMap[emp.id];
                if (!r) return null;
                const total = r.total_days || 1;
                return (
                  <View key={emp.id} style={[styles.reportRow2, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
                    <View style={[styles.avatar, { backgroundColor: emp.bg || colors.muted, width: 36, height: 36, borderRadius: 18 }]}>
                      <Text style={[styles.avatarText, { color: emp.color, fontSize: 14 }]}>{emp.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={[styles.empName, { color: colors.foreground, fontSize: 14 }]}>{emp.name}</Text>
                        <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{r.present + r.late}/{total} дн.</Text>
                      </View>
                      <View style={styles.reportBarRow}>
                        <View style={[styles.barSeg, { flex: r.present, backgroundColor: colors.success }]} />
                        <View style={[styles.barSeg, { flex: r.late, backgroundColor: colors.warning }]} />
                        <View style={[styles.barSeg, { flex: r.absent, backgroundColor: colors.danger }]} />
                        <View style={[styles.barSeg, { flex: Math.max(0, total - r.present - r.late - r.absent), backgroundColor: colors.muted }]} />
                      </View>
                      <View style={styles.reportLegend}>
                        <Text style={[styles.legendText, { color: colors.success }]}>✓{r.present}</Text>
                        <Text style={[styles.legendText, { color: colors.warning }]}>⌚{r.late}</Text>
                        <Text style={[styles.legendText, { color: colors.danger }]}>✗{r.absent}</Text>
                        {r.total_late_min > 0 && <Text style={[styles.legendText, { color: colors.mutedForeground }]}>+{r.total_late_min}м</Text>}
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniStat({ label, value, color, suffix = "" }: { label: string; value: number; color: string; suffix?: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[styles.miniValue, { color }]}>{value}{suffix}</Text>
      <Text style={[styles.miniLabel]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 0, borderBottomWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 10 },
  tabRow: { flexDirection: "row" },
  tab: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  // Check-in banner
  checkinBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  checkinLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  checkinIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  checkinStatus: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  checkinSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  checkinBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  checkinBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  // Settings tab
  settingsCard: { padding: 14, gap: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  settingsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  settingsLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  settingsInput: { paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, fontFamily: "Inter_500Medium", minWidth: 80, textAlign: "center" },
  settingsDivider: { height: 1 },
  saveBtn2: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, gap: 6, marginTop: 4 },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  officeItemCard: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10, marginBottom: 6, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  officeItemLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  delBtn: { padding: 8 },
  addInput: { paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 },
  gpsBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  gpsBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  exportBtnFull: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderWidth: 1 },
  exportBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  statCard: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#888", marginTop: 2, textAlign: "center" },
  statDiv: { width: 1, marginVertical: 4 },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  navBtn: { padding: 6 },
  dateText: { fontSize: 15, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  list: { padding: 12, gap: 10, paddingBottom: 100 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 4 },
  noDataList: { gap: 8, marginTop: 12 },
  card: { flexDirection: "row", alignItems: "center", padding: 14, justifyContent: "space-between", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  empInfo: { flex: 1 },
  empName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  empRole: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardRight: { alignItems: "flex-end", gap: 4 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  lateText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  tagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  // Team tab
  teamCard: { padding: 14, gap: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  teamCardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  pctText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  progressBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  teamStats: { flexDirection: "row", justifyContent: "space-between" },
  miniValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  miniLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#888", textAlign: "center" },
  // Map tab
  officeCard: { padding: 14, gap: 12, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  officeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  officeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  officeName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  officeCoords: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  officeInfo: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, paddingTop: 10 },
  officeRadius: { fontSize: 13, fontFamily: "Inter_400Regular" },
  mapEmbed: { height: 200 },
  mapBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, gap: 8 },
  mapBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  // Report tab
  reportSummary: { padding: 16, marginBottom: 4, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  reportTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },
  reportGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reportGridItem: { flex: 1, minWidth: "44%", padding: 10, alignItems: "center" },
  reportGridValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  reportGridLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
  reportRow2: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  reportBarRow: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden" },
  barSeg: { height: 8 },
  reportLegend: { flexDirection: "row", gap: 10 },
  legendText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
