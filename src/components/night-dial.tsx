import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export type DialPhaseState = "empty" | "set" | "done" | "active" | "upcoming";

type NightDialProps = {
  size: number;
  phases: { color: string; state: DialPhaseState }[];
  /** 0..1 through the active phase; lights that arc's dots and moves the marker. */
  progress?: number;
  ringColor: string;
  children?: ReactNode;
};

const DOTS_PER_PHASE = 16;
const GAP_SLOTS = 2;
const SLOTS = 3 * (DOTS_PER_PHASE + GAP_SLOTS);

/**
 * The console's hero: the night as a ring of three LED arcs, one per phase
 * (dusk → night → dawn clockwise from the top). Dots are positioned Views
 * rather than SVG arcs, so no native drawing dependency is needed.
 */
export function NightDial({
  size,
  phases,
  progress = 0,
  ringColor,
  children,
}: NightDialProps) {
  const dot = Math.max(4, Math.round(size * 0.034));
  const radius = size / 2 - dot * 1.4;
  const innerRadius = radius - dot * 2.4;
  const litCount = Math.round(
    Math.min(1, Math.max(0, progress)) * DOTS_PER_PHASE,
  );

  const dots = phases.flatMap((phase, phaseIndex) =>
    Array.from({ length: DOTS_PER_PHASE }, (_, dotIndex) => {
      const slot =
        phaseIndex * (DOTS_PER_PHASE + GAP_SLOTS) +
        GAP_SLOTS / 2 +
        dotIndex +
        0.5;
      const angle = (slot / SLOTS) * 2 * Math.PI;
      let scale = 1;
      let opacity = 1;
      let glow = false;
      switch (phase.state) {
        case "empty":
          scale = 0.45;
          opacity = 0.55;
          break;
        case "done":
          opacity = 0.4;
          break;
        case "upcoming":
          opacity = 0.26;
          break;
        case "active": {
          const isMarker = dotIndex === Math.max(0, litCount - 1);
          opacity = dotIndex < Math.max(1, litCount) ? 1 : 0.22;
          scale = isMarker ? 1.9 : 1;
          glow = isMarker;
          break;
        }
      }
      const diameter = dot * scale;
      const cx = size / 2 + radius * Math.sin(angle);
      const cy = size / 2 - radius * Math.cos(angle);
      return (
        <View
          key={`${phaseIndex}-${dotIndex}`}
          style={[
            {
              position: "absolute",
              left: cx - diameter / 2,
              top: cy - diameter / 2,
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              backgroundColor: phase.color,
              opacity,
            },
            glow && { boxShadow: `0 0 ${dot * 2.5}px ${phase.color}` },
          ]}
        />
      );
    }),
  );

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={{
            position: "absolute",
            left: size / 2 - innerRadius,
            top: size / 2 - innerRadius,
            width: innerRadius * 2,
            height: innerRadius * 2,
            borderRadius: innerRadius,
            borderWidth: 1,
            borderColor: ringColor,
          }}
        />
        {dots}
      </View>
      <View style={[styles.center, { pointerEvents: "box-none" }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
