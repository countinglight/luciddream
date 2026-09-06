import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

/** A ~1s, very-low-amplitude tone (not true digital silence — some Android
 * media-session implementations are more willing to reclaim an all-zero
 * buffer as "not really playing"). Looped continuously for a run's whole
 * duration so expo-audio's own Android foreground service
 * (FOREGROUND_SERVICE_MEDIA_PLAYBACK, declared by its config plugin) stays
 * alive through a script's silent `wait` gaps instead of dropping between
 * signal plays — see the M3 plan's foreground-service decision. */
const KEEP_ALIVE_SOURCE = require('../../assets/sounds/keep-alive.wav');
const KEEP_ALIVE_VOLUME = 0.01;

export type KeepAliveTrack = {
  stop(): void;
};

/** No-op on web — there's no OS foreground service to hold there, and
 * looping an inaudible track would just waste a decoder for nothing. */
export function startKeepAliveTrack(): KeepAliveTrack {
  if (Platform.OS === 'web') {
    return { stop() {} };
  }

  const player: AudioPlayer = createAudioPlayer(KEEP_ALIVE_SOURCE);
  player.loop = true;
  player.volume = KEEP_ALIVE_VOLUME;
  player.play();

  return {
    stop() {
      player.remove();
    },
  };
}
