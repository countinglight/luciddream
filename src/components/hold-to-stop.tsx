import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/icons";

type HoldToStopProps = {
  onConfirm: () => void;
  holdMs?: number;
  size?: number;
  color: string;
  trackColor: string;
  surfaceColor: string;
  textColor: string;
  label?: string;
};

const RING_DOTS = 28;

/**
 * Stop needs a deliberate press-and-hold (the ring fills while held) so a
 * half-asleep tap can't end the night. Screen readers get a direct activate
 * action, since holding isn't an available gesture there.
 */
export function HoldToStopButton({
  onConfirm,
  holdMs = 1800,
  size = 104,
  color,
  trackColor,
  surfaceColor,
  textColor,
  label = "Hold to stop",
}: HoldToStopProps) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const begin = () => {
    clearTimer();
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const next = Math.min(1, (Date.now() - startedAt) / holdMs);
      setProgress(next);
      if (next >= 1) {
        clearTimer();
        setProgress(0);
        onConfirm();
      }
    }, 40);
  };

  const cancel = () => {
    clearTimer();
    setProgress(0);
  };

  const dot = Math.max(3, size * 0.045);
  const radius = size / 2 - dot;
  const lit = Math.round(progress * RING_DOTS);
  const inner = size * 0.74;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPressIn={begin}
        onPressOut={cancel}
        accessibilityRole="button"
        accessibilityLabel="Stop the night"
        accessibilityHint="Press and hold to stop the run"
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "activate") onConfirm();
        }}
        style={{ width: size, height: size }}
      >
        {Array.from({ length: RING_DOTS }, (_, index) => {
          const angle = (index / RING_DOTS) * 2 * Math.PI;
          return (
            <View
              key={index}
              style={{
                position: "absolute",
                left: size / 2 + radius * Math.sin(angle) - dot / 2,
                top: size / 2 - radius * Math.cos(angle) - dot / 2,
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                backgroundColor: index < lit ? color : trackColor,
              }}
            />
          );
        })}
        <View
          style={[
            styles.core,
            {
              left: (size - inner) / 2,
              top: (size - inner) / 2,
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              backgroundColor: surfaceColor,
              borderColor: trackColor,
              transform: [{ scale: 1 - progress * 0.06 }],
            },
          ]}
        >
          <Icon name="stop" color={color} size={inner * 0.5} />
        </View>
      </Pressable>
      <Text style={[styles.label, { color: textColor }]}>
        {progress > 0 ? "Keep holding…" : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 10,
  },
  core: {
    position: "absolute",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
  },
});
