// Sound configuration shared across the extension
export const SOUND_SETS = {
  typewriter: {
    default: 'assets/sounds/typewriter/key-press.wav',
    Enter: 'assets/sounds/typewriter/enter-key.wav',
    Backspace: 'assets/sounds/typewriter/backspace-tyr.wav',
  },
  soft: {
    default: 'assets/sounds/keyboard/soft.wav',
  },
  medium: {
    default: 'assets/sounds/keyboard/medium.wav',
  },
  hard: {
    default: 'assets/sounds/keyboard/hard.wav',
  },
  drum: {
    default: 'assets/sounds/drum/snare1.wav',
    Enter: 'assets/sounds/drum/kick1.wav',
    Backspace: 'assets/sounds/drum/openSnare1.wav',
    ' ': 'assets/sounds/drum/tom1.wav',
  },
};

// Default settings
export const DEFAULT_SETTINGS = {
  soundSet: 'medium',
  volume: 0.7,
  isMuted: false,
};

// Message types for consistent communication
export const MESSAGE_TYPES = {
  KEYPRESS: 'KEYPRESS',
  PLAY_SOUND: 'PLAY_SOUND',
  TOGGLE_MUTE: 'TOGGLE_MUTE',
  STATE_CHANGE: 'STATE_CHANGE',
};

// Storage keys
export const STORAGE_KEYS = {
  SOUND_SET: 'soundSet',
  VOLUME: 'volume',
  IS_MUTED: 'isMuted',
  THEME: 'theme',
};
