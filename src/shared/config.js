import { profileLoader } from '../utils/profileLoader';

// Legacy SOUND_SETS - dynamically populated from YAML profiles
// This maintains backward compatibility while using the new profile system
export let SOUND_SETS = {};

// Check if we're in a content script context (limited chrome API access)
const isContentScript = () => {
  try {
    // Content scripts can access chrome.runtime but not chrome.runtime.getManifest
    return typeof chrome !== 'undefined' &&
           chrome.runtime &&
           chrome.runtime.getURL &&
           !chrome.runtime.getManifest; // This will be undefined in content scripts
  } catch (e) {
    return true; // Assume content script if chrome APIs are restricted
  }
};

// Initialize SOUND_SETS from profile loader
export const initializeSoundSets = async () => {
  // In content scripts, use fallback immediately to avoid fetch issues
  if (isContentScript()) {
    SOUND_SETS = {
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
    return;
  }

  try {
    const profiles = await profileLoader.loadBundledProfiles();
    SOUND_SETS = {};

    for (const profile of profiles) {
      SOUND_SETS[profile.id] = await profileLoader.profileToLegacyFormat(profile);
    }
  } catch (error) {
    console.warn('Failed to initialize sound sets from profiles, using fallback:', error);
    // Fallback to hardcoded configuration if profile loading fails
    SOUND_SETS = {
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
  }
};

// Get profile-aware sound sets
export const getSoundSets = async () => {
  if (Object.keys(SOUND_SETS).length === 0) {
    await initializeSoundSets();
  }
  return SOUND_SETS;
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
