import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

import { DEFAULT_VOICE_INTERRUPT_CONFIG, VoiceInterruptDetector, type VoiceInterruptEvent } from '@/session/voice-interrupt';

const RECORDING_OPTIONS = { ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true };
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
 */
export type VoiceInterruptMonitor = {
  isRecording: boolean;
  meteringDb: number | null;
  permission: 'idle' | 'requesting' | 'granted' | 'denied' | 'error';
};

export function useVoiceInterrupt(enabled: boolean, onEvent: (event: VoiceInterruptEvent) => void): VoiceInterruptMonitor {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, POLL_INTERVAL_MS);
  const detectorRef = useRef<VoiceInterruptDetector | null>(null);
  const onEventRef = useRef(onEvent);
  const [permission, setPermission] = useState<VoiceInterruptMonitor['permission']>('idle');

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!enabled) return;
    detectorRef.current = new VoiceInterruptDetector(DEFAULT_VOICE_INTERRUPT_CONFIG);
    let cancelled = false;

    requestRecordingPermissionsAsync()
      .then(({ granted }) => {
        if (cancelled) return;
        setPermission(granted ? 'granted' : 'denied');
        if (granted) recorder.record();
      })
      .catch(() => {
        if (!cancelled) setPermission('error');
      });

    return () => {
      cancelled = true;
      detectorRef.current = null;
      recorder.stop().catch(() => {});
    };
  }, [enabled, recorder]);

  useEffect(() => {
    if (!detectorRef.current || !state.isRecording || state.metering === undefined) return;
    const event = detectorRef.current.feed(state.metering, Date.now());
    if (event) onEventRef.current(event);
  }, [state.isRecording, state.metering]);

  return {
    isRecording: state.isRecording,
    meteringDb: state.metering ?? null,
    permission: enabled ? permission : 'idle',
  };
}
