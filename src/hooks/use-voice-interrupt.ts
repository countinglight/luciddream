import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useEffect, useRef, useState } from "react";

import { deleteRecordingFile } from "@/session/recording-file";
import {
  DEFAULT_VOICE_INTERRUPT_CONFIG,
  VoiceInterruptDetector,
  type VoiceInterruptEvent,
} from "@/session/voice-interrupt";

const RECORDING_OPTIONS = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
};
// expo-audio's metering poll; well under the detector's 1.5s sustain window
// (session/voice-interrupt.ts) so a real sustained sound gets several
// samples, not just one.
const POLL_INTERVAL_MS = 500;

/**
 * Mic-level voice/sound interrupt (spec §4.6) — no speech recognition, just
 * expo-audio's existing metering. Only records while `enabled`; requests
 * `RECORD_AUDIO` lazily on first enable rather than at app start, per §4.6's
 * "users who never touch the setting see no new permission prompt at all."
 *
 * Split out as its own hook (rather than living in session.ts) because
 * expo-audio has no imperative recorder constructor — `useAudioRecorder` is
 * hook-only (see AudioModule.types.d.ts), unlike `createAudioPlayer`.
 *
 * The recorder writes a real file even though only its metering is wanted.
 * This hook owns that file: it reports the path to its caller while
 * recording, so an interrupted night can have it deleted at the next launch,
 * and deletes it on every exit — including cancellation part-way through
 * preparation (AR-02 / A1).
 */
export type VoiceInterruptMonitor = {
  isRecording: boolean;
  meteringDb: number | null;
  permission: "idle" | "requesting" | "granted" | "denied" | "error";
};

export type VoiceInterruptOptions = {
  /** Called with the temporary recording's path while it exists, and null
   * once it has been deleted. */
  onRecordingFile?: (uri: string | null) => void;
};

export function useVoiceInterrupt(
  enabled: boolean,
  onEvent: (event: VoiceInterruptEvent) => void,
  options: VoiceInterruptOptions = {},
): VoiceInterruptMonitor {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, POLL_INTERVAL_MS);
  const detectorRef = useRef<VoiceInterruptDetector | null>(null);
  const onEventRef = useRef(onEvent);
  const onRecordingFileRef = useRef(options.onRecordingFile);
  const [permission, setPermission] =
    useState<VoiceInterruptMonitor["permission"]>("idle");

  useEffect(() => {
    onEventRef.current = onEvent;
    onRecordingFileRef.current = options.onRecordingFile;
  });

  useEffect(() => {
    if (!enabled) return;
    detectorRef.current = new VoiceInterruptDetector(
      DEFAULT_VOICE_INTERRUPT_CONFIG,
    );
    let cancelled = false;
    // Captured as soon as the recorder has a path, so cleanup can delete it
    // even if preparation was abandoned half way.
    let ownedUri: string | null = null;
    const claim = (uri: string | null | undefined) => {
      if (!uri) return;
      ownedUri = uri;
      onRecordingFileRef.current?.(uri);
    };

    setPermission("requesting");
    (async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      if (cancelled) return;
      setPermission(granted ? "granted" : "denied");
      if (!granted) return;
      // expo-audio's native recorders need preparing before `record()`;
      // without it the recorder never starts on iOS or Android and metering
      // stays empty. The session has already enabled recording in the audio
      // mode (session.ts) by the time a run is `running`.
      await recorder.prepareToRecordAsync();
      claim(recorder.uri);
      if (cancelled) return;
      recorder.record();
      claim(recorder.uri);
    })().catch(() => {
      if (!cancelled) setPermission("error");
      claim(recorder.uri);
    });

    return () => {
      cancelled = true;
      detectorRef.current = null;
      const uri = recorder.uri ?? ownedUri;
      void recorder
        .stop()
        .catch(() => {
          // Stopping a recorder that never started is expected here.
        })
        .then(async () => {
          // Delete after stop: the file is still open until then.
          await deleteRecordingFile(uri ?? ownedUri);
          onRecordingFileRef.current?.(null);
        });
    };
  }, [enabled, recorder]);

  useEffect(() => {
    if (
      !detectorRef.current ||
      !state.isRecording ||
      state.metering === undefined
    )
      return;
    const event = detectorRef.current.feed(state.metering, Date.now());
    if (event) onEventRef.current(event);
  }, [state.isRecording, state.metering]);

  return {
    isRecording: state.isRecording,
    meteringDb: state.metering ?? null,
    permission: enabled ? permission : "idle",
  };
}
