export const SOUNDS = {
  chime: { label: 'Chime', source: require('../../assets/sounds/chime.wav') },
  bell: { label: 'Bell', source: require('../../assets/sounds/bell.wav') },
  alert: { label: 'Alert', source: require('../../assets/sounds/alert.wav') },
} as const;

export type SoundId = keyof typeof SOUNDS;

export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];
