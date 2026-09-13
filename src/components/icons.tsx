import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export type IconName =
  | "play"
  | "plus"
  | "close"
  | "chevron-right"
  | "chevron-down"
  | "moon"
  | "stop"
  | "books"
  | "sliders"
  | "more"
  | "check"
  | "mic"
  | "share"
  | "download"
  | "trash"
  | "speaker"
  | "speaker-high"
  | "script"
  | "wave";

type IconProps = {
  name: IconName;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Icons drawn with plain Views so they render the same on iOS, Android and
 * web with no icon font or SVG dependency — neither is installed, and adding a
 * native one would force a new dev build for a visual-only change.
 */
export function Icon({ name, color, size = 20, style }: IconProps) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {glyph(name, size, Math.max(1.5, size / 11), color)}
    </View>
  );
}

function bar(
  width: number,
  height: number,
  color: string,
  extra?: ViewStyle,
): ReactNode {
  return (
    <View
      style={[
        {
          position: "absolute",
          width,
          height,
          borderRadius: Math.min(width, height),
          backgroundColor: color,
        },
        extra,
      ]}
    />
  );
}

function chevron(
  s: number,
  stroke: number,
  color: string,
  rotate: string,
  extra?: ViewStyle,
): ReactNode {
  return (
    <View
      style={[
        {
          width: s,
          height: s,
          borderTopWidth: stroke,
          borderRightWidth: stroke,
          borderColor: color,
          transform: [{ rotate }],
        },
        extra,
      ]}
    />
  );
}

function glyph(
  name: IconName,
  s: number,
  stroke: number,
  color: string,
): ReactNode {
  switch (name) {
    case "play":
      return (
        <View
          style={{
            width: 0,
            height: 0,
            marginLeft: s * 0.14,
            borderStyle: "solid",
            borderLeftWidth: s * 0.6,
            borderTopWidth: s * 0.36,
            borderBottomWidth: s * 0.36,
            borderLeftColor: color,
            borderTopColor: "transparent",
            borderBottomColor: "transparent",
          }}
        />
      );
    case "plus":
      return (
        <>
          {bar(s * 0.7, stroke, color)}
          {bar(stroke, s * 0.7, color)}
        </>
      );
    case "close":
      return (
        <View
          style={{
            width: s,
            height: s,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ rotate: "45deg" }],
          }}
        >
          {bar(s * 0.8, stroke, color)}
          {bar(stroke, s * 0.8, color)}
        </View>
      );
    case "chevron-right":
      return chevron(s * 0.4, stroke, color, "45deg", {
        marginLeft: -s * 0.16,
      });
    case "chevron-down":
      return chevron(s * 0.4, stroke, color, "135deg", {
        marginTop: -s * 0.16,
      });
    case "moon":
      return (
        <View
          style={{
            width: s * 0.78,
            height: s * 0.78,
            borderRadius: s,
            borderLeftWidth: s * 0.24,
            borderColor: color,
            transform: [{ rotate: "-30deg" }],
          }}
        />
      );
    case "stop":
      return (
        <View
          style={{
            width: s * 0.5,
            height: s * 0.5,
            borderRadius: s * 0.1,
            backgroundColor: color,
          }}
        />
      );
    case "books":
      return (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: s * 0.13,
            height: s * 0.72,
          }}
        >
          <View
            style={{
              width: stroke * 1.2,
              height: s * 0.72,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              width: stroke * 1.2,
              height: s * 0.72,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              width: s * 0.2,
              height: s * 0.68,
              borderRadius: stroke,
              borderWidth: stroke,
              borderColor: color,
              transform: [{ rotate: "-16deg" }],
            }}
          />
        </View>
      );
    case "sliders":
      return (
        <View style={{ gap: s * 0.22 }}>
          {[0.46, 0.08].map((dotLeft) => (
            <View
              key={dotLeft}
              style={{
                width: s * 0.8,
                height: s * 0.26,
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  height: stroke,
                  borderRadius: stroke,
                  backgroundColor: color,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: s * dotLeft,
                  width: s * 0.26,
                  height: s * 0.26,
                  borderRadius: s,
                  backgroundColor: color,
                }}
              />
            </View>
          ))}
        </View>
      );
    case "more":
      return (
        <View style={{ flexDirection: "row", gap: s * 0.12 }}>
          {[0, 1, 2].map((dot) => (
            <View
              key={dot}
              style={{
                width: s * 0.17,
                height: s * 0.17,
                borderRadius: s,
                backgroundColor: color,
              }}
            />
          ))}
        </View>
      );
    case "check":
      return (
        <View
          style={{
            width: s * 0.3,
            height: s * 0.58,
            borderRightWidth: stroke * 1.3,
            borderBottomWidth: stroke * 1.3,
            borderColor: color,
            transform: [{ translateY: -s * 0.06 }, { rotate: "45deg" }],
          }}
        />
      );
    case "mic":
      return (
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: s * 0.34,
              height: s * 0.5,
              borderRadius: s,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <View
            style={{ width: stroke, height: s * 0.16, backgroundColor: color }}
          />
          <View
            style={{
              width: s * 0.36,
              height: stroke,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
        </View>
      );
    case "share":
      return (
        <View style={{ alignItems: "center" }}>
          {chevron(s * 0.28, stroke, color, "-45deg", {
            marginBottom: -s * 0.2,
          })}
          <View
            style={{ width: stroke, height: s * 0.44, backgroundColor: color }}
          />
          <View
            style={{
              width: s * 0.66,
              height: s * 0.24,
              marginTop: -s * 0.08,
              borderLeftWidth: stroke,
              borderRightWidth: stroke,
              borderBottomWidth: stroke,
              borderColor: color,
              borderBottomLeftRadius: s * 0.08,
              borderBottomRightRadius: s * 0.08,
            }}
          />
        </View>
      );
    case "download":
      return (
        <View style={{ alignItems: "center" }}>
          <View
            style={{ width: stroke, height: s * 0.46, backgroundColor: color }}
          />
          {chevron(s * 0.28, stroke, color, "135deg", { marginTop: -s * 0.27 })}
          <View
            style={{
              width: s * 0.68,
              height: stroke,
              marginTop: s * 0.12,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
        </View>
      );
    case "trash":
      return (
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: s * 0.66,
              height: stroke,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              width: s * 0.48,
              height: s * 0.56,
              marginTop: s * 0.06,
              borderWidth: stroke,
              borderTopWidth: 0,
              borderColor: color,
              borderBottomLeftRadius: s * 0.08,
              borderBottomRightRadius: s * 0.08,
            }}
          />
        </View>
      );
    case "speaker":
    case "speaker-high":
      return (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: s * 0.18,
              height: s * 0.3,
              borderRadius: s * 0.04,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              width: 0,
              height: 0,
              marginLeft: -s * 0.02,
              borderRightWidth: s * 0.24,
              borderTopWidth: s * 0.3,
              borderBottomWidth: s * 0.3,
              borderRightColor: color,
              borderTopColor: "transparent",
              borderBottomColor: "transparent",
            }}
          />
          {name === "speaker-high" && (
            <View
              style={{
                width: s * 0.3,
                height: s * 0.54,
                marginLeft: -s * 0.08,
                borderRadius: s,
                borderRightWidth: stroke,
                borderColor: color,
              }}
            />
          )}
        </View>
      );
    case "script":
      return (
        <View style={{ gap: s * 0.14, alignItems: "flex-start" }}>
          {[0.62, 0.62, 0.4].map((width, index) => (
            <View
              key={index}
              style={{
                width: s * width,
                height: stroke,
                borderRadius: stroke,
                backgroundColor: color,
              }}
            />
          ))}
        </View>
      );
    case "wave":
      return (
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: s * 0.09 }}
        >
          {[0.3, 0.7, 0.5, 0.85, 0.4].map((height, index) => (
            <View
              key={index}
              style={{
                width: stroke,
                height: s * height,
                borderRadius: stroke,
                backgroundColor: color,
              }}
            />
          ))}
        </View>
      );
  }
}
