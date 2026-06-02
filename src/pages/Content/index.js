import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS, getSoundSets } from '../../shared/config';

// State management
let isMuted = DEFAULT_SETTINGS.isMuted;
let currentSoundSet = DEFAULT_SETTINGS.soundSet;
let volume = DEFAULT_SETTINGS.volume;

// Audio context and buffers
let audioContext = null;
const soundBuffers = {};
let isAudioInitialized = false;
let audioContextResumed = false;

// Track whether injected script is active to prevent duplicate events
let injectedScriptActive = false;
let fallbackListenersEnabled = false;
const FALLBACK_TIMEOUT = 500; // Enable fallback if no heartbeat after 500ms

const runtimeStats = {
  loadedSoundCount: 0,
  failedSoundCount: 0,
  loadAttemptCount: 0,
  keyEventCount: 0,
  playedSoundCount: 0,
  droppedSoundCount: 0,
  lastEventAt: null,
  lastSoundAt: null,
  lastErrorCode: null,
  lastErrorAt: null,
};

function recordError(code) {
  runtimeStats.lastErrorCode = code;
  runtimeStats.lastErrorAt = new Date().toISOString();
}

function getContentStatus() {
  const selectedProfile = soundBuffers[currentSoundSet];
  const defaultMapping = selectedProfile?.default || {};
  const selectedProfileLoaded = Object.values(defaultMapping).some(buffer => Boolean(buffer));

  return {
    ok: true,
    muted: isMuted,
    volumePercent: Math.round(volume * 100),
    selectedProfile: currentSoundSet,
    selectedProfileLoaded,
    loadedProfileCount: Object.keys(soundBuffers).length,
    audioInitialized: isAudioInitialized,
    audioContextState: audioContext?.state || 'none',
    audioContextResumed,
    captureMode: injectedScriptActive
      ? 'injected'
      : fallbackListenersEnabled
      ? 'fallback'
      : 'pending',
    documentVisible: document.visibilityState === 'visible',
    documentFocused: document.hasFocus(),
    stats: { ...runtimeStats },
  };
}

// Initialize Web Audio API (creates suspended context)
async function initAudio() {
  if (isAudioInitialized) return;

  try {
    // Create AudioContext in suspended state (allowed without user gesture)
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await loadSounds();
    isAudioInitialized = true;
    console.log('Keyboard ASMR: Audio initialized successfully');
  } catch (error) {
    recordError('audio_init_failed');
    console.error('Keyboard ASMR: Failed to initialize audio:', error);
  }
}

// Resume AudioContext on first user interaction
async function ensureAudioContextResumed() {
  if (!audioContext || audioContextResumed) return;

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    audioContextResumed = true;
    console.log('Keyboard ASMR: AudioContext resumed');
  } catch (error) {
    recordError('audio_resume_failed');
    console.error('Keyboard ASMR: Failed to resume AudioContext:', error);
  }
}

// Load and cache sounds
async function loadSounds() {
  const loadSound = async url => {
    try {
      runtimeStats.loadAttemptCount += 1;
      const response = await fetch(chrome.runtime.getURL(url));
      const arrayBuffer = await response.arrayBuffer();
      const decodedAudio = await audioContext.decodeAudioData(arrayBuffer);
      runtimeStats.loadedSoundCount += 1;
      return decodedAudio;
    } catch (error) {
      runtimeStats.failedSoundCount += 1;
      recordError('sound_load_failed');
      console.error(`Keyboard ASMR: Error loading sound: ${url}`, error);
      return null;
    }
  };

  try {
    runtimeStats.loadedSoundCount = 0;
    runtimeStats.failedSoundCount = 0;
    runtimeStats.loadAttemptCount = 0;

    // Get sound sets from profile loader (with fallback)
    const SOUND_SETS = await getSoundSets();

    // Load all sounds from configuration (new format only)
    for (const [setName, keyMappings] of Object.entries(SOUND_SETS)) {
      soundBuffers[setName] = {};

      for (const [key, eventMappings] of Object.entries(keyMappings)) {
        soundBuffers[setName][key] = {};

        // Initialize all three event types
        for (const eventType of ['keydown', 'keyup', 'keypress']) {
          const path = eventMappings[eventType];

          if (path === null) {
            // Explicitly disabled - no fallback
            soundBuffers[setName][key][eventType] = null;
          } else if (path) {
            // Load sound
            soundBuffers[setName][key][eventType] = await loadSound(path);
          } else {
            // Missing from config - will fall back to default at runtime
            soundBuffers[setName][key][eventType] = undefined;
          }
        }
      }
    }
  } catch (error) {
    recordError('sound_sets_failed');
    console.error('Keyboard ASMR: Failed to load sound sets:', error);
  }
}

// Play sound directly in content script
async function playSound(key, eventType = 'keydown') {
  if (isMuted || !isAudioInitialized) return;

  // Ensure AudioContext is resumed before playing
  await ensureAudioContextResumed();

  // Try specific key + event type
  let buffer = soundBuffers[currentSoundSet]?.[key]?.[eventType];

  // If undefined (not explicitly set), fall back to default
  if (buffer === undefined) {
    buffer = soundBuffers[currentSoundSet]?.default?.[eventType];
  }

  // If null (explicitly disabled) or still undefined, or no audioContext, return (no sound)
  if (!buffer || !audioContext) {
    runtimeStats.droppedSoundCount += 1;
    return;
  }

  try {
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    source.buffer = buffer;
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start(0);
    runtimeStats.playedSoundCount += 1;
    runtimeStats.lastSoundAt = new Date().toISOString();
  } catch (error) {
    recordError('sound_play_failed');
    console.error('Keyboard ASMR: Error playing sound:', error);
  }
}

// Inject the keyboard capture script into the page
function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.bundle.js');
  script.onload = function () {
    this.remove();
  };

  // Inject as early as possible
  (document.head || document.documentElement).appendChild(script);
}

// Alternative injection method using inline script (backup - not currently used)
// function injectInlineScript() {
//   const scriptContent = `(${injectedFunction.toString()})();`;
//   const script = document.createElement('script');
//   script.textContent = scriptContent;
//   (document.head || document.documentElement).appendChild(script);
//   script.remove();
// }

// Legacy injected function (backup - not currently used)
// function injectedFunction() {
//   const MESSAGE_SOURCE = 'keyboard-asmr-injected';
//   const DEBOUNCE_DELAY = 30;
//   let lastKeyTime = 0;
//
//   function handleKeyboardEvent(event) {
//     if (event.ctrlKey || event.metaKey || event.altKey) return;
//
//     const currentTime = Date.now();
//     if (currentTime - lastKeyTime < DEBOUNCE_DELAY) return;
//     lastKeyTime = currentTime;
//
//     window.postMessage(
//       {
//         source: MESSAGE_SOURCE,
//         type: 'KEYPRESS',
//         data: { key: event.key, timestamp: currentTime },
//       },
//       '*'
//     );
//   }
//
//   window.addEventListener('keydown', handleKeyboardEvent, true);
//   document.addEventListener('keydown', handleKeyboardEvent, true);
// }

// Listen for messages from injected script
window.addEventListener('message', async event => {
  // Only accept messages from the same window
  if (event.source !== window) return;

  // Check if it's our message
  if (event.data?.source === 'keyboard-asmr-injected') {
    // Handle ready signal from injected script
    if (event.data?.type === 'INJECTED_READY') {
      injectedScriptActive = true;
      console.log('Keyboard ASMR: Injected script confirmed active, disabling fallback listeners');
      return;
    }

    // Handle keypress events
    if (event.data?.type === 'KEYPRESS') {
      runtimeStats.keyEventCount += 1;
      runtimeStats.lastEventAt = new Date().toISOString();

      // Initialize audio on first keypress if needed
      if (!isAudioInitialized) {
        await initAudio();
      }

      // Play sound directly (only if not muted)
      if (!isMuted) {
        const { key, eventType } = event.data.data;
        await playSound(key, eventType || 'keydown'); // Default to keydown for backward compat
      }
    }
  }
});

// Load initial settings
chrome.storage.sync.get(
  [STORAGE_KEYS.SOUND_SET, STORAGE_KEYS.VOLUME, STORAGE_KEYS.IS_MUTED],
  result => {
    currentSoundSet = result[STORAGE_KEYS.SOUND_SET] || DEFAULT_SETTINGS.soundSet;
    volume =
      result[STORAGE_KEYS.VOLUME] !== undefined
        ? result[STORAGE_KEYS.VOLUME] / 100
        : DEFAULT_SETTINGS.volume;
    isMuted = result[STORAGE_KEYS.IS_MUTED] ?? DEFAULT_SETTINGS.isMuted;
  }
);

// Listen for setting changes
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync') {
    if (changes[STORAGE_KEYS.SOUND_SET]) {
      currentSoundSet = changes[STORAGE_KEYS.SOUND_SET].newValue;
      // Reload sounds if sound set changed
      if (isAudioInitialized) {
        await loadSounds();
      }
    }
    if (changes[STORAGE_KEYS.VOLUME]) {
      volume = changes[STORAGE_KEYS.VOLUME].newValue / 100;
    }
    if (changes[STORAGE_KEYS.IS_MUTED]) {
      isMuted = changes[STORAGE_KEYS.IS_MUTED].newValue;
    }
  }
});

// Listen for state changes from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.GET_STATUS) {
    sendResponse(getContentStatus());
    return;
  }

  if (message.type === MESSAGE_TYPES.STATE_CHANGE) {
    isMuted = message.isMuted;
  }
});

// Fallback keyboard event handlers (only used if injection fails)
async function handleFallbackKeydown(event) {
  if (isMuted) return;

  runtimeStats.keyEventCount += 1;
  runtimeStats.lastEventAt = new Date().toISOString();

  // Initialize audio on first keypress if needed
  if (!isAudioInitialized) {
    await initAudio();
  }

  // Determine event type based on repeat flag
  const eventType = event.repeat ? 'keypress' : 'keydown';
  await playSound(event.key, eventType);
}

async function handleFallbackKeyup(event) {
  if (isMuted) return;

  runtimeStats.keyEventCount += 1;
  runtimeStats.lastEventAt = new Date().toISOString();

  // Initialize audio if needed
  if (!isAudioInitialized) {
    await initAudio();
  }

  await playSound(event.key, 'keyup');
}

// Enable fallback listeners only if injected script fails to load
function enableFallbackListeners() {
  fallbackListenersEnabled = true;
  console.log('Keyboard ASMR: Enabling fallback event listeners');
  document.addEventListener('keydown', handleFallbackKeydown);
  document.addEventListener('keyup', handleFallbackKeyup);
}

// Wait for injected script confirmation, enable fallback if timeout
setTimeout(() => {
  if (!injectedScriptActive) {
    console.log('Keyboard ASMR: Injected script not detected, using fallback listeners');
    enableFallbackListeners();
  }
}, FALLBACK_TIMEOUT);

// Try to inject script early
if (document.documentElement) {
  injectScript();
} else {
  // Wait for document to be ready
  const observer = new MutationObserver((mutations, obs) => {
    if (document.documentElement) {
      obs.disconnect();
      injectScript();
    }
  });
  observer.observe(document, { childList: true, subtree: true });
}

// Initialize audio context early (in suspended state)
// This avoids the "user gesture" requirement since context starts suspended
initAudio().catch(error => {
  console.error('Keyboard ASMR: Failed to pre-initialize audio:', error);
});

console.log('Keyboard ASMR: Content script loaded');
