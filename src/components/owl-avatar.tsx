import { Image, View } from "react-native";

type OwlAvatarProps = {
  size: number;
  borderColor?: string;
  glowColor?: string;
};

/** The brand owl (Galina Landes' painting) as a round medallion. */
export function OwlAvatar({ size, borderColor, glowColor }: OwlAvatarProps) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="LucidDream owl"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          backgroundColor: "#f2efe9",
          borderWidth: borderColor ? Math.max(2, Math.round(size * 0.03)) : 0,
          borderColor,
        },
        glowColor
          ? { boxShadow: `0 0 ${Math.round(size * 0.35)}px ${glowColor}` }
          : null,
      ]}
    >
      <Image
        source={require("@/assets/images/owl.png")}
        style={{ width: "100%", height: "100%" }}
        resizeMode="cover"
      />
    </View>
  );
}
