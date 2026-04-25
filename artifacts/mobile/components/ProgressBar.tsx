import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ProgressBarProps {
  progress: number;
  showLabel?: boolean;
}

export function ProgressBar({ progress, showLabel = true }: ProgressBarProps) {
  const colors = useColors();
  const clipped = Math.max(0, Math.min(100, progress));
  const color =
    clipped >= 80
      ? colors.success
      : clipped >= 40
      ? colors.warning
      : colors.danger;

  return (
    <View style={styles.row}>
      <View
        style={[styles.track, { backgroundColor: colors.border, borderRadius: 4 }]}
      >
        <View
          style={[
            styles.fill,
            { width: `${clipped}%` as any, backgroundColor: color, borderRadius: 4 },
          ]}
        />
      </View>
      {showLabel && (
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          {clipped}%
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  track: {
    flex: 1,
    height: 6,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    width: 30,
    textAlign: "right",
  },
});
