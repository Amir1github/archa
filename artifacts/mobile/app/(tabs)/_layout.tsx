import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

function NativeTabLayout() {
  const { user } = useAuth();
  const isRkoUser = user ? (user.role?.toLowerCase().includes("директор") || user.role?.toLowerCase().includes("главный бухгалт")) : false;
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Директор</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tasks">
        <Icon sf={{ default: "checkmark.square", selected: "checkmark.square.fill" }} />
        <Label>Задачи</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="attendance">
        <Icon sf={{ default: "clock", selected: "clock.fill" }} />
        <Label>HR</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="workplan">
        <Icon sf={{ default: "calendar", selected: "calendar.fill" }} />
        <Label>График</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="debtors">
        <Icon sf={{ default: "dollarsign.circle", selected: "dollarsign.circle.fill" }} />
        <Label>Дебиторы</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sales">
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>Продажи</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="warehouse">
        <Icon sf={{ default: "shippingbox", selected: "shippingbox.fill" }} />
        <Label>Склад</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ai-chat">
        <Icon sf={{ default: "cpu", selected: "cpu.fill" }} />
        <Label>AI Агент</Label>
      </NativeTabs.Trigger>
      {isRkoUser && (
        <NativeTabs.Trigger name="rko">
          <Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
          <Label>РКО</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} />
        <Label>Профиль</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const isRkoUser = user ? (user.role?.toLowerCase().includes("директор") || user.role?.toLowerCase().includes("главный бухгалт")) : false;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          height: isWeb ? 84 : 60,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]}
            />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_500Medium",
          marginBottom: isWeb ? 8 : 2,
        },
        tabBarIconStyle: { marginTop: isWeb ? 8 : 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Директор",
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Задачи",
          tabBarIcon: ({ color }) => <Feather name="check-square" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: "HR",
          tabBarIcon: ({ color }) => <Feather name="clock" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="workplan"
        options={{
          title: "График",
          tabBarIcon: ({ color }) => <Feather name="calendar" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="debtors"
        options={{
          title: "Дебиторы",
          tabBarIcon: ({ color }) => <Feather name="dollar-sign" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: "Продажи",
          tabBarIcon: ({ color }) => <Feather name="trending-up" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="warehouse"
        options={{
          title: "Склад",
          tabBarIcon: ({ color }) => <Feather name="package" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ai-chat"
        options={{
          title: "AI Агент",
          tabBarIcon: ({ color }) => <Feather name="cpu" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="rko"
        options={{
          title: "РКО",
          href: isRkoUser ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="file-text" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="employees"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { user, isLoading } = useAuth();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
