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
    console.error('Keyboard ASMR: Failed to resume AudioContext:', error);
  }
}

// Load and cache sounds
async function loadSounds() {
  const loadSound = async url => {
    try {
      const response = await fetch(chrome.runtime.getURL(url));
      const arrayBuffer = await response.arrayBuffer();
      return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error(`Keyboard ASMR: Error loading sound: ${url}`, error);
      return null;
    }
  };

  try {
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
  if (!buffer || !audioContext) return;

  try {
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    source.buffer = buffer;
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start(0);
  } catch (error) {
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
  if (event.data?.source === 'keyboard-asmr-injected' && event.data?.type === 'KEYPRESS') {
    // Initialize audio on first keypress if needed
    if (!isAudioInitialized) {
      await initAudio();
    }

    // Play sound directly (only if not muted)
    if (!isMuted) {
      const { key, eventType } = event.data.data;
      await playSound(key, eventType || 'keydown'); // Default to keydown for backward compat
    }

    // Also notify background for icon updates (optional)
    chrome.runtime
      .sendMessage({
        type: MESSAGE_TYPES.KEYPRESS,
        key: event.data.data.key,
      })
      .catch(() => {
        // Ignore errors if background is not available
      });
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
  if (message.type === MESSAGE_TYPES.STATE_CHANGE) {
    isMuted = message.isMuted;
  }
});

// Fallback: Also listen for keyboard events directly (for sites where injection fails)
document.addEventListener('keydown', async event => {
  if (isMuted) return;

  // Initialize audio on first keypress if needed
  if (!isAudioInitialized) {
    await initAudio();
  }

  // Determine event type based on repeat flag
  const eventType = event.repeat ? 'keypress' : 'keydown';
  await playSound(event.key, eventType);

  // Notify background
  chrome.runtime
    .sendMessage({
      type: MESSAGE_TYPES.KEYPRESS,
      key: event.key,
    })
    .catch(() => {});
});

// Fallback: Listen for keyup events
document.addEventListener('keyup', async event => {
  if (isMuted) return;

  // Initialize audio if needed
  if (!isAudioInitialized) {
    await initAudio();
  }

  await playSound(event.key, 'keyup');

  // Notify background
  chrome.runtime
    .sendMessage({
      type: MESSAGE_TYPES.KEYPRESS,
      key: event.key,
    })
    .catch(() => {});
});

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
