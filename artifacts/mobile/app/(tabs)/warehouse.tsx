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
import { EmptyState } from "@/components/EmptyState";
import type { WarehouseItem } from "@/types";

export default function WarehouseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Все");

  const { data: items, isLoading, refetch } = useQuery<WarehouseItem[]>({
    queryKey: ["warehouse"],
    queryFn: () => apiGet("/api/warehouse"),
  });

  const { data: categories } = useQuery<string[]>({
    queryKey: ["warehouse-categories"],
    queryFn: () => apiGet("/api/warehouse/categories"),
  });

  const allCategories = ["Все", ...(categories || [])];

  const filtered = (items || []).filter((item) => {
    if (categoryFilter !== "Все" && item.category !== categoryFilter) return false;
    if (
      search &&
      !item.name.toLowerCase().includes(search.toLowerCase()) &&
      !item.sku.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const alertCount = filtered.filter(
    (item) => item.qty === 0 || item.qty <= item.min_qty
  ).length;

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
        <Text style={[styles.title, { color: colors.foreground }]}>Склад</Text>
        {alertCount > 0 && (
          <View
            style={[
              styles.alertBadge,
              { backgroundColor: colors.danger + "20", borderRadius: colors.radius },
            ]}
          >
            <Feather name="alert-triangle" size={14} color={colors.danger} />
            <Text style={[styles.alertText, { color: colors.danger }]}>
              {alertCount} тревог
            </Text>
          </View>
        )}
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
            placeholder="Поиск товара..."
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
        style={[styles.catScroll, { backgroundColor: colors.card }]}
        contentContainerStyle={styles.catContent}
      >
        {allCategories.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setCategoryFilter(cat)}
            style={[
              styles.catChip,
              {
                backgroundColor:
                  categoryFilter === cat ? colors.primary : colors.muted,
                borderRadius: 100,
              },
            ]}
          >
            <Text
              style={[
                styles.catText,
                {
                  color:
                    categoryFilter === cat ? "#fff" : colors.mutedForeground,
                },
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="package"
          title="Нет товаров"
          subtitle="Товары не найдены"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} />
          }
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((item) => {
            const isOut = item.qty === 0;
            const isLow = !isOut && item.qty <= item.min_qty;
            const alertColor = isOut
              ? colors.danger
              : isLow
              ? colors.warning
              : colors.success;

            return (
              <View
                key={item.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderRadius: colors.radius,
                    shadowColor: colors.shadow,
                    borderLeftWidth: 3,
                    borderLeftColor: alertColor,
                  },
                ]}
              >
                <View style={styles.cardTop}>
                  <Text
                    style={[styles.itemName, { color: colors.foreground }]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <View style={styles.qtyBox}>
                    <Text
                      style={[styles.qtyNum, { color: alertColor }]}
                    >
                      {item.qty}
                    </Text>
                    <Text style={[styles.qtyUnit, { color: colors.mutedForeground }]}>
                      {item.unit}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    {item.sku}
                  </Text>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    {item.category}
                  </Text>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    {item.warehouse_name}
                  </Text>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={[styles.price, { color: colors.foreground }]}>
                    {item.price.toLocaleString()} сум
                  </Text>
                  {isOut && (
                    <View
                      style={[
                        styles.stockTag,
                        { backgroundColor: colors.danger + "20", borderRadius: 100 },
                      ]}
                    >
                      <Text style={[styles.stockTagText, { color: colors.danger }]}>
                        Нет в наличии
                      </Text>
                    </View>
                  )}
                  {isLow && (
                    <View
                      style={[
                        styles.stockTag,
                        { backgroundColor: colors.warning + "20", borderRadius: 100 },
                      ]}
                    >
                      <Text style={[styles.stockTagText, { color: colors.warning }]}>
                        Мало: мин. {item.min_qty}
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
  alertBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  alertText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  searchRow: { padding: 12, borderBottomWidth: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  catScroll: { flexGrow: 0, borderBottomWidth: 1 },
  catContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  catChip: { paddingHorizontal: 14, paddingVertical: 6 },
  catText: { fontSize: 13, fontFamily: "Inter_500Medium" },
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  itemName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  qtyBox: { alignItems: "flex-end" },
  qtyNum: { fontSize: 22, fontFamily: "Inter_700Bold" },
  qtyUnit: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardMeta: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  price: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stockTag: { paddingHorizontal: 8, paddingVertical: 3 },
  stockTagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
