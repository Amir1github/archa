import React, { useState, useMemo } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Linking,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/constants/api";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import type { Attendance, Employee } from "@/types";

function getTodayISO() { return new Date().toISOString().split("T")[0]; }

type Tab = "today" | "team" | "map" | "report";

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
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [date, setDate] = useState(getTodayISO());

  const { data: attendance = [], isLoading: loadAtt, refetch } = useQuery<Attendance[]>({
    queryKey: ["attendance", date],
    queryFn: () => apiGet(`/api/attendance?date=${date}`),
  });
  const { data: employees = [], isLoading: loadEmp } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiGet("/api/employees"),
  });
  const { data: report = [], isLoading: loadReport } = useQuery<AttendanceReport[]>({
    queryKey: ["attendance-report"],
    queryFn: () => apiGet("/api/attendance/report?period=month"),
    enabled: activeTab === "report" || activeTab === "team",
  });
  const { data: offices = [], isLoading: loadOffices } = useQuery<Office[]>({
    queryKey: ["offices"],
    queryFn: () => apiGet("/api/offices"),
    enabled: activeTab === "map",
  });

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

  const prevDay = () => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().split("T")[0]); };
  const nextDay = () => { const d = new Date(date); d.setDate(d.getDate() + 1); if (d <= new Date()) setDate(d.toISOString().split("T")[0]); };

  const TABS: [Tab, string, string][] = [
    ["today", "Сегодня", "clock"],
    ["team", "Команда", "users"],
    ["map", "Карта", "map-pin"],
    ["report", "Отчёт", "file-text"],
  ];

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
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 4 }]}>Офисы и геолокации</Text>
          {loadOffices ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : offices.length === 0 ? (
            <EmptyState icon="map-pin" title="Офисы не настроены" subtitle="Добавьте офисы в настройках" />
          ) : offices.map((office) => (
            <View key={office.id} style={[styles.officeCard, { backgroundColor: colors.card, borderRadius: colors.radius, shadowColor: colors.shadow }]}>
              <View style={styles.officeHeader}>
                <View style={[styles.officeIcon, { backgroundColor: colors.primary + "20" }]}>
                  <Feather name="map-pin" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.officeName, { color: colors.foreground }]}>{office.name}</Text>
                  <Text style={[styles.officeCoords, { color: colors.mutedForeground }]}>
                    {office.lat.toFixed(4)}° N, {office.lng.toFixed(4)}° E
                  </Text>
                </View>
                <View style={[styles.tag, { backgroundColor: office.active ? colors.success + "20" : colors.muted }]}>
                  <Text style={[styles.tagText, { color: office.active ? colors.success : colors.mutedForeground }]}>
                    {office.active ? "Активен" : "Неактивен"}
                  </Text>
                </View>
              </View>
              <View style={[styles.officeInfo, { borderTopColor: colors.border }]}>
                <Feather name="circle" size={13} color={colors.mutedForeground} />
                <Text style={[styles.officeRadius, { color: colors.mutedForeground }]}>Радиус: {office.radius} м</Text>
              </View>
              {Platform.OS === "web" ? (
                <View style={[styles.mapEmbed, { borderRadius: colors.radius / 2, overflow: "hidden" }]}>
                  <iframe
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${office.lng - 0.01}%2C${office.lat - 0.01}%2C${office.lng + 0.01}%2C${office.lat + 0.01}&layer=mapnik&marker=${office.lat}%2C${office.lng}`}
                    style={{ border: 0, width: "100%", height: 200 }}
                    title={office.name}
                  />
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.mapBtn, { backgroundColor: colors.primary, borderRadius: colors.radius / 2 }]}
                  onPress={() => Linking.openURL(`https://maps.google.com/?q=${office.lat},${office.lng}`)}
                >
                  <Feather name="external-link" size={14} color="#fff" />
                  <Text style={styles.mapBtnText}>Открыть в картах</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
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
