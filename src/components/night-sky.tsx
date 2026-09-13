import { StyleSheet, View, type DimensionValue } from "react-native";

import { radialGlow } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const STARS: { left: DimensionValue; top: DimensionValue; size: number }[] = [
  { left: "10%", top: "11%", size: 2 },
  { left: "82%", top: "15%", size: 2 },
  { left: "67%", top: "22%", size: 1.5 },
  { left: "91%", top: "35%", size: 2 },
  { left: "6%", top: "39%", size: 1.5 },
  { left: "25%", top: "27%", size: 1.5 },
  { left: "48%", top: "6%", size: 2 },
  { left: "35%", top: "17%", size: 1 },
  { left: "74%", top: "48%", size: 1 },
  { left: "15%", top: "58%", size: 1 },
  { left: "95%", top: "66%", size: 1.5 },
  { left: "4%", top: "80%", size: 1 },
];

/** Soft glow behind the dial plus a sparse star field (stars only show in the
 * dark theme — their token is transparent in light). Decorative only. */
export function NightSky() {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        radialGlow(theme.glow),
        { pointerEvents: "none" },
      ]}
    >
      {STARS.map((star, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            borderRadius: star.size,
            backgroundColor: theme.star,
          }}
        />
      ))}
    </View>
  );
}
