import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = PropsWithChildren<{
  /** Reported so a night's own record can say the app fell over. */
  onError?: (error: Error, info: ErrorInfo) => void;
}>;

type State = { error: Error | null };

/**
 * Last line of defence for the whole app.
 *
 * React unmounts the entire tree when a render throws. Without a boundary
 * that means a blank screen, and — because the crash usually comes from
 * something persisted that will still be there next launch — a blank screen
 * every time the app is opened afterwards. An app that cannot be reopened is
 * worse than any single broken feature, and this one is used by someone who
 * may be half asleep and not in a position to debug anything.
 *
 * Deliberately plain: no theme, no context, no hooks, no storage. Anything it
 * depended on could be the thing that just failed. Colours are literals for
 * the same reason.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      this.props.onError?.(error, info);
    } catch {
      // The reporter failing must not re-enter the boundary.
    }
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            LucidDream ran into a problem and stopped this screen. Your nights
            and your library are still saved.
          </Text>
          <Text style={styles.body}>
            If a night was running, it may have ended. Tap Try again, then check
            Nights.
          </Text>

          <Pressable
            style={styles.button}
            onPress={this.reset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.buttonLabel}>Try again</Text>
          </Pressable>

          <Text style={styles.detailLabel}>What happened</Text>
          <Text style={styles.detail} selectable>
            {error.message || String(error)}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1020" },
  content: { padding: 24, paddingTop: 96, gap: 16 },
  title: { color: "#F4F4F6", fontSize: 24, fontWeight: "600" },
  body: { color: "#C3C6D4", fontSize: 15, lineHeight: 22 },
  button: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: "#6B7BE8",
  },
  buttonLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  detailLabel: {
    marginTop: 16,
    color: "#8A8FA3",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  detail: { color: "#8A8FA3", fontSize: 13, fontFamily: "monospace" },
});
