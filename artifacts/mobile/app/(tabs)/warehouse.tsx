import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl, Platform,
  Modal, Alert, Pressable, Dimensions,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { apiGet, apiPut, apiDelete } from "@/constants/api";
import { EmptyState } from "@/components/EmptyState";
import type { WarehouseItem } from "@/types";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── Photo Picker Modal ───────────────────────────────────────────────────────
function PhotoModal({
  item, visible, onClose, onUpdated,
}: {
  item: WarehouseItem | null;
  visible: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  if (!item) return null;
  const hasPhoto = !!(previewUri || item.photo);
  const displayUri = previewUri || item.photo || null;

  async function pickImage(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Нет доступа", fromCamera ? "Разрешите доступ к камере" : "Разрешите доступ к галерее");
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.65, allowsEditing: true, aspect: [4, 3] })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.65, allowsEditing: true, aspect: [4, 3], mediaTypes: "images" });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${asset.base64}`;

    setUploading(true);
    try {
      await apiPut(`/api/warehouse/${item.id}/photo`, { photo: dataUrl });
      setPreviewUri(dataUrl);
      onUpdated();
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить фото");
    } finally {
      setUploading(false);
    }
  }

  function showPickerMenu() {
    Alert.alert("Добавить фото", "Выберите источник", [
      { text: "Камера", onPress: () => pickImage(true) },
      { text: "Галерея", onPress: () => pickImage(false) },
      { text: "Отмена", style: "cancel" },
    ]);
  }

  async function deletePhoto() {
    Alert.alert("Удалить фото", "Вы уверены?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить", style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await apiDelete(`/api/warehouse/${item.id}/photo`);
            setPreviewUri(null);
            onUpdated();
          } catch {
            Alert.alert("Ошибка", "Не удалось удалить фото");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  function handleClose() {
    setPreviewUri(null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.modalOverlay} onPress={handleClose} />
      <View style={[styles.modalSheet, {
        backgroundColor: colors.card,
        paddingBottom: insets.bottom + 16,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }]}>
        {/* Handle */}
        <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={2}>
            {item.name}
          </Text>
          <TouchableOpacity onPress={handleClose} style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}>
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Photo area */}
        <View style={[styles.photoArea, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
          {hasPhoto && displayUri ? (
            <Image
              source={{ uri: displayUri }}
              style={styles.photoFull}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Feather name="image" size={56} color={colors.border} />
              <Text style={[styles.photoPlaceholderText, { color: colors.mutedForeground }]}>
                Фото не добавлено
              </Text>
            </View>
          )}
          {(uploading || deleting) && (
            <View style={styles.photoOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.photoOverlayText}>
                {uploading ? "Загрузка..." : "Удаление..."}
              </Text>
            </View>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.photoActions}>
          <TouchableOpacity
            onPress={showPickerMenu}
            disabled={uploading || deleting}
            style={[styles.photoActionBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, flex: 1 }]}
          >
            <Feather name="camera" size={18} color="#fff" />
            <Text style={styles.photoActionBtnText}>{hasPhoto ? "Изменить фото" : "Добавить фото"}</Text>
          </TouchableOpacity>
          {hasPhoto && (
            <TouchableOpacity
              onPress={deletePhoto}
              disabled={uploading || deleting}
              style={[styles.photoDeleteBtn, { backgroundColor: colors.danger + "15", borderRadius: colors.radius, borderColor: colors.danger + "40", borderWidth: 1 }]}
            >
              <Feather name="trash-2" size={18} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>

        {/* Item details */}
        <View style={[styles.detailGrid, { borderColor: colors.border }]}>
          <DetailRow label="Артикул" value={item.sku} colors={colors} />
          <DetailRow label="Категория" value={item.category} colors={colors} />
          <DetailRow label="Поставщик" value={item.supplier || "—"} colors={colors} />
          <DetailRow label="Склад" value={item.warehouse_name} colors={colors} />
          <DetailRow label="Последнее поступление" value={item.last_in || "—"} colors={colors} />
          <DetailRow label="Цена" value={`${item.price.toLocaleString()} сум`} colors={colors} />
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WarehouseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Все");
  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null);

  const { data: items, isLoading, refetch, isRefetching } = useQuery<WarehouseItem[]>({
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
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !item.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const alertCount = filtered.filter((item) => item.qty === 0 || item.qty <= item.min_qty).length;
  const withPhotos = (items || []).filter((i) => i.photo).length;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["warehouse"] });
  }, [queryClient]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Склад</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {items?.length || 0} товаров · {withPhotos} с фото
          </Text>
        </View>
        {alertCount > 0 && (
          <View style={[styles.alertBadge, { backgroundColor: colors.danger + "20", borderRadius: colors.radius }]}>
            <Feather name="alert-triangle" size={14} color={colors.danger} />
            <Text style={[styles.alertText, { color: colors.danger }]}>{alertCount} тревог</Text>
          </View>
        )}
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            placeholder="Поиск по названию или артикулу..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.catScroll, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.catContent}
      >
        {allCategories.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setCategoryFilter(cat)}
            style={[styles.catChip, { backgroundColor: categoryFilter === cat ? colors.primary : colors.muted, borderRadius: 100 }]}
          >
            <Text style={[styles.catText, { color: categoryFilter === cat ? "#fff" : colors.mutedForeground }]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="package" title="Нет товаров" subtitle="Товары не найдены" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((item) => {
            const isOut = item.qty === 0;
            const isLow = !isOut && item.qty <= item.min_qty;
            const alertColor = isOut ? colors.danger : isLow ? colors.warning : colors.success;

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => setSelectedItem(item)}
                activeOpacity={0.75}
                style={[styles.card, {
                  backgroundColor: colors.card,
                  borderRadius: colors.radius,
                  shadowColor: colors.shadow,
                  borderLeftWidth: 3,
                  borderLeftColor: alertColor,
                }]}
              >
                {/* Photo thumbnail + content */}
                <View style={styles.cardInner}>
                  {/* Thumbnail */}
                  <View style={[styles.thumbContainer, { backgroundColor: colors.muted, borderRadius: colors.radius / 2 }]}>
                    {item.photo ? (
                      <Image
                        source={{ uri: item.photo }}
                        style={styles.thumb}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <Feather name="package" size={22} color={colors.border} />
                      </View>
                    )}
                    {/* Camera badge if no photo */}
                    {!item.photo && (
                      <View style={[styles.cameraBadge, { backgroundColor: colors.primary + "dd" }]}>
                        <Feather name="camera" size={9} color="#fff" />
                      </View>
                    )}
                  </View>

                  {/* Details */}
                  <View style={styles.cardContent}>
                    <View style={styles.cardTop}>
                      <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <View style={styles.qtyBox}>
                        <Text style={[styles.qtyNum, { color: alertColor }]}>{item.qty}</Text>
                        <Text style={[styles.qtyUnit, { color: colors.mutedForeground }]}>{item.unit}</Text>
                      </View>
                    </View>

                    <View style={styles.cardMeta}>
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{item.sku}</Text>
                      <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{item.category}</Text>
                      <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{item.warehouse_name}</Text>
                    </View>

                    <View style={styles.cardFooter}>
                      <Text style={[styles.price, { color: colors.foreground }]}>
                        {item.price.toLocaleString()} сум
                      </Text>
                      <View style={styles.tagsRow}>
                        {isOut && (
                          <View style={[styles.stockTag, { backgroundColor: colors.danger + "20", borderRadius: 100 }]}>
                            <Text style={[styles.stockTagText, { color: colors.danger }]}>Нет в наличии</Text>
                          </View>
                        )}
                        {isLow && (
                          <View style={[styles.stockTag, { backgroundColor: colors.warning + "20", borderRadius: 100 }]}>
                            <Text style={[styles.stockTagText, { color: colors.warning }]}>Мало: мин. {item.min_qty}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Photo Modal */}
      <PhotoModal
        item={selectedItem}
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onUpdated={handleUpdated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  alertBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, gap: 5 },
  alertText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  searchRow: { padding: 12, borderBottomWidth: 1 },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  catScroll: { flexGrow: 0, borderBottomWidth: 1 },
  catContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: "row" },
  catChip: { paddingHorizontal: 14, paddingVertical: 6 },
  catText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { padding: 12, gap: 10, paddingBottom: 100 },
  card: {
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    overflow: "hidden",
  },
  cardInner: { flexDirection: "row", gap: 12, padding: 12 },
  thumbContainer: { width: 72, height: 72, overflow: "hidden", position: "relative" },
  thumb: { width: 72, height: 72 },
  thumbPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  cameraBadge: {
    position: "absolute", bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  cardContent: { flex: 1, gap: 6 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  itemName: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  qtyBox: { alignItems: "flex-end" },
  qtyNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  qtyUnit: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  metaDot: { fontSize: 11 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  price: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tagsRow: { flexDirection: "row", gap: 4 },
  stockTag: { paddingHorizontal: 8, paddingVertical: 3 },
  stockTagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { maxHeight: SCREEN_H * 0.9, paddingHorizontal: 16, paddingTop: 8 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  modalTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", lineHeight: 24 },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  photoArea: {
    height: 220, overflow: "hidden", marginBottom: 12,
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  photoFull: { width: "100%", height: "100%" },
  photoPlaceholder: { alignItems: "center", gap: 12 },
  photoPlaceholderText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  photoOverlayText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  photoActions: { flexDirection: "row", gap: 8, marginBottom: 16 },
  photoActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  photoActionBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  photoDeleteBtn: { width: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  detailGrid: { borderTopWidth: 1, gap: 0 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1 },
  detailLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", flex: 1, marginLeft: 16 },
});
