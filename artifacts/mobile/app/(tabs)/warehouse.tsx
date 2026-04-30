import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl, Platform,
  Modal, Alert, Pressable, Dimensions, KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet, apiPost, apiPut, apiDelete } from "@/constants/api";
import { EmptyState } from "@/components/EmptyState";
import type { WarehouseItem } from "@/types";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── Загрузка фото через FileReader (веб) или ImagePicker (нативный) ─────────
async function uploadPhotoDataUrl(
  dataUrl: string,
  itemId: string,
  setUploading: (v: boolean) => void,
  setPreviewUri: (v: string) => void,
  onUpdated: () => void,
) {
  setUploading(true);
  try {
    await apiPut(`/api/warehouse/${itemId}/photo`, { photo: dataUrl });
    setPreviewUri(dataUrl);
    onUpdated();
  } catch (e: any) {
    Alert.alert("Ошибка", "Не удалось загрузить фото: " + (e?.message || ""));
  } finally {
    setUploading(false);
  }
}

// Открывает нативный file input на вебе
function openWebFilePicker(
  itemId: string,
  setUploading: (v: boolean) => void,
  setPreviewUri: (v: string) => void,
  onUpdated: () => void,
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  document.body.appendChild(input);
  input.onchange = () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) { setUploading(false); return; }
      await uploadPhotoDataUrl(dataUrl, itemId, setUploading, setPreviewUri, onUpdated);
    };
    reader.onerror = () => {
      setUploading(false);
      Alert.alert("Ошибка", "Не удалось прочитать файл");
    };
    reader.readAsDataURL(file);
  };
  input.oncancel = () => document.body.removeChild(input);
  input.click();
}

// Открывает ImagePicker на нативном
async function openNativePicker(
  fromCamera: boolean,
  itemId: string,
  setUploading: (v: boolean) => void,
  setPreviewUri: (v: string) => void,
  onUpdated: () => void,
) {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    Alert.alert("Нет доступа", fromCamera ? "Разрешите доступ к камере" : "Разрешите доступ к галерее");
    return;
  }
  const opts: ImagePicker.ImagePickerOptions = { base64: true, quality: 0.45, allowsEditing: true, aspect: [4, 3], mediaTypes: "images" as any };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);

  if (result.canceled || !result.assets?.[0]) return;
  const asset = result.assets[0];

  let dataUrl: string | null = null;
  if (asset.base64) {
    dataUrl = `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
  } else if (asset.uri) {
    try {
      const resp = await fetch(asset.uri);
      const blob = await resp.blob();
      dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
    } catch { /* ignore */ }
  }
  if (!dataUrl) { Alert.alert("Ошибка", "Не удалось получить данные фото"); return; }
  await uploadPhotoDataUrl(dataUrl, itemId, setUploading, setPreviewUri, onUpdated);
}

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
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!item) return null;
  const hasPhoto = !!(previewUri || item.photo);
  const displayUri = previewUri || item.photo || null;

  function handleAddPhoto() {
    if (Platform.OS === "web") {
      openWebFilePicker(item.id, setUploading, (uri) => setPreviewUri(uri), onUpdated);
    } else {
      Alert.alert("Добавить фото", "Выберите источник", [
        { text: "Камера", onPress: () => openNativePicker(true, item.id, setUploading, (u) => setPreviewUri(u), onUpdated) },
        { text: "Галерея", onPress: () => openNativePicker(false, item.id, setUploading, (u) => setPreviewUri(u), onUpdated) },
        { text: "Отмена", style: "cancel" },
      ]);
    }
  }

  async function handleDeletePhoto() {
    setDeleting(true);
    setConfirmDelete(false);
    try {
      await apiDelete(`/api/warehouse/${item.id}/photo`);
      setPreviewUri(null);
      onUpdated();
    } catch {
      Alert.alert("Ошибка", "Не удалось удалить фото");
    } finally {
      setDeleting(false);
    }
  }

  function handleClose() {
    setPreviewUri(null);
    setConfirmDelete(false);
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
                Нажмите кнопку ниже чтобы добавить фото
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
            onPress={handleAddPhoto}
            disabled={uploading || deleting}
            style={[styles.photoActionBtn, {
              backgroundColor: uploading ? colors.border : colors.primary,
              borderRadius: colors.radius, flex: 1,
            }]}
          >
            {uploading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="upload" size={18} color="#fff" />
            }
            <Text style={styles.photoActionBtnText}>
              {uploading ? "Загрузка..." : hasPhoto ? "Изменить фото" : "Добавить фото"}
            </Text>
          </TouchableOpacity>
          {hasPhoto && !confirmDelete && (
            <TouchableOpacity
              onPress={() => setConfirmDelete(true)}
              disabled={uploading || deleting}
              style={[styles.photoDeleteBtn, { backgroundColor: colors.danger + "15", borderRadius: colors.radius, borderColor: colors.danger + "40", borderWidth: 1 }]}
            >
              <Feather name="trash-2" size={18} color={colors.danger} />
            </TouchableOpacity>
          )}
          {confirmDelete && (
            <TouchableOpacity
              onPress={handleDeletePhoto}
              disabled={deleting}
              style={[styles.photoDeleteBtn, { backgroundColor: colors.danger, borderRadius: colors.radius }]}
            >
              {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Да</Text>}
            </TouchableOpacity>
          )}
        </View>
        {confirmDelete && (
          <TouchableOpacity onPress={() => setConfirmDelete(false)} style={{ alignItems: "center", paddingVertical: 6 }}>
            <Text style={[{ fontSize: 13, fontFamily: "Inter_400Regular" }, { color: colors.mutedForeground }]}>Отмена удаления</Text>
          </TouchableOpacity>
        )}

        {/* Item details */}
        <View style={[styles.detailGrid, { borderColor: colors.border }]}>
          <DetailRow label="Артикул" value={item.sku || "—"} colors={colors} />
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

// ─── Add Item Modal ───────────────────────────────────────────────────────────
const UNITS = ["шт", "кг", "л", "м", "м²", "м³", "уп", "рул", "бут", "пар"];
const CATEGORIES = ["Краски и ЛКМ", "Кабели и провода", "Инструменты", "Крепёж", "Сантехника", "Электрика", "Прочее"];
const WAREHOUSES = ["Склад №1", "Склад №2", "Магазин"];

interface AddForm {
  name: string; sku: string; category: string;
  qty: string; unit: string; min_qty: string;
  price: string; warehouse_name: string; supplier: string;
}

function AddItemModal({ visible, onClose, onAdded }: {
  visible: boolean; onClose: () => void; onAdded: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AddForm>({
    name: "", sku: "", category: "Прочее",
    qty: "", unit: "шт", min_qty: "",
    price: "", warehouse_name: "Склад №1", supplier: "",
  });

  function set(key: keyof AddForm, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function reset() {
    setForm({ name: "", sku: "", category: "Прочее", qty: "", unit: "шт", min_qty: "", price: "", warehouse_name: "Склад №1", supplier: "" });
  }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert("Ошибка", "Введите название товара"); return; }
    setSaving(true);
    try {
      await apiPost("/api/warehouse", {
        name: form.name.trim(),
        sku: form.sku.trim(),
        category: form.category,
        qty: parseFloat(form.qty) || 0,
        unit: form.unit,
        min_qty: parseFloat(form.min_qty) || 0,
        price: parseFloat(form.price) || 0,
        warehouse_name: form.warehouse_name,
        supplier: form.supplier.trim(),
      });
      reset();
      onAdded();
      onClose();
    } catch {
      Alert.alert("Ошибка", "Не удалось добавить товар");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() { reset(); onClose(); }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.modalOverlay} onPress={handleClose} />
        <View style={[styles.addSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.addHeader}>
            <Text style={[styles.addTitle, { color: colors.foreground }]}>Новый товар</Text>
            <TouchableOpacity onPress={handleClose} style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {/* Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Название *</Text>
              <TextInput
                value={form.name}
                onChangeText={(v) => set("name", v)}
                placeholder="Например: Краска фасадная белая"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.fieldInput, { backgroundColor: colors.muted, color: colors.foreground, borderRadius: colors.radius / 2 }]}
              />
            </View>

            {/* SKU + Unit */}
            <View style={styles.rowGroup}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Артикул</Text>
                <TextInput
                  value={form.sku}
                  onChangeText={(v) => set("sku", v)}
                  placeholder="KFB-001"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.fieldInput, { backgroundColor: colors.muted, color: colors.foreground, borderRadius: colors.radius / 2 }]}
                />
              </View>
              <View style={[styles.fieldGroup, { width: 100 }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Ед. изм.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 44 }} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
                  {UNITS.map((u) => (
                    <TouchableOpacity key={u} onPress={() => set("unit", u)}
                      style={[styles.miniChip, { backgroundColor: form.unit === u ? colors.primary : colors.muted, borderRadius: 8 }]}>
                      <Text style={[styles.miniChipText, { color: form.unit === u ? "#fff" : colors.mutedForeground }]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Qty + Min qty */}
            <View style={styles.rowGroup}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Количество</Text>
                <TextInput
                  value={form.qty}
                  onChangeText={(v) => set("qty", v)}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  style={[styles.fieldInput, { backgroundColor: colors.muted, color: colors.foreground, borderRadius: colors.radius / 2 }]}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Мин. остаток</Text>
                <TextInput
                  value={form.min_qty}
                  onChangeText={(v) => set("min_qty", v)}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  style={[styles.fieldInput, { backgroundColor: colors.muted, color: colors.foreground, borderRadius: colors.radius / 2 }]}
                />
              </View>
            </View>

            {/* Price */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Цена (сум)</Text>
              <TextInput
                value={form.price}
                onChangeText={(v) => set("price", v)}
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                style={[styles.fieldInput, { backgroundColor: colors.muted, color: colors.foreground, borderRadius: colors.radius / 2 }]}
              />
            </View>

            {/* Category */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Категория</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c} onPress={() => set("category", c)}
                    style={[styles.chip, { backgroundColor: form.category === c ? colors.primary : colors.muted, borderRadius: 100 }]}>
                    <Text style={[styles.chipText, { color: form.category === c ? "#fff" : colors.mutedForeground }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Warehouse */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Место хранения</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {WAREHOUSES.map((w) => (
                  <TouchableOpacity key={w} onPress={() => set("warehouse_name", w)}
                    style={[styles.chip, { backgroundColor: form.warehouse_name === w ? colors.primary : colors.muted, borderRadius: 100 }]}>
                    <Text style={[styles.chipText, { color: form.warehouse_name === w ? "#fff" : colors.mutedForeground }]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Supplier */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Поставщик</Text>
              <TextInput
                value={form.supplier}
                onChangeText={(v) => set("supplier", v)}
                placeholder="Название поставщика"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.fieldInput, { backgroundColor: colors.muted, color: colors.foreground, borderRadius: colors.radius / 2 }]}
              />
            </View>
          </ScrollView>

          {/* Save button */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !form.name.trim()}
            style={[styles.saveBtn, {
              backgroundColor: form.name.trim() && !saving ? colors.primary : colors.border,
              borderRadius: colors.radius,
              marginTop: 16,
            }]}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="plus" size={20} color="#fff" />}
            <Text style={styles.saveBtnText}>{saving ? "Сохранение..." : "Добавить товар"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WarehouseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Все");
  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: items, isLoading, refetch, isRefetching } = useQuery<WarehouseItem[]>({
    queryKey: ["warehouse"],
    queryFn: () => apiGet("/api/warehouse"),
    staleTime: 3 * 60 * 1000,
  });

  const { data: categories } = useQuery<string[]>({
    queryKey: ["warehouse-categories"],
    queryFn: () => apiGet("/api/warehouse/categories"),
    staleTime: 10 * 60 * 1000,
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

  // Синхронизируем selectedItem при обновлении списка (например, после загрузки фото)
  useEffect(() => {
    if (selectedItem && items) {
      const updated = items.find((i) => i.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
    }
  }, [items]);

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
        {can("warehouse.manage") && (
          <TouchableOpacity
            onPress={() => setShowAdd(true)}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="plus" size={22} color="#fff" />
          </TouchableOpacity>
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

      {/* FAB — добавить товар */}
      <TouchableOpacity
        onPress={() => setShowAdd(true)}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 80 }]}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Photo Modal */}
      <PhotoModal
        item={selectedItem}
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onUpdated={handleUpdated}
      />

      {/* Add Item Modal */}
      <AddItemModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={handleUpdated}
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
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  // Add modal
  addSheet: { maxHeight: SCREEN_H * 0.9, paddingHorizontal: 16, paddingTop: 8, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  addHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  addTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  fieldGroup: { gap: 6 },
  rowGroup: { flexDirection: "row", gap: 12 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldInput: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  chip: { paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  miniChip: { paddingHorizontal: 8, paddingVertical: 5 },
  miniChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
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
