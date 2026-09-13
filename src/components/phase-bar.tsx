import { View } from "react-native";

export type PhaseBarSegment = { color: string; weight: number };

/** Proportional strip of how a night was spent per phase. */
export function PhaseBar({
  segments,
  height = 8,
}: {
  segments: PhaseBarSegment[];
  height?: number;
}) {
  const visible = segments.filter((segment) => segment.weight > 0);
  if (visible.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", gap: 3, height }}>
      {visible.map((segment, index) => (
        <View
          key={index}
          style={{
            flexGrow: segment.weight,
            flexBasis: 0,
            minWidth: height,
            borderRadius: height / 2,
            backgroundColor: segment.color,
          }}
        />
      ))}
    </View>
  );
}
