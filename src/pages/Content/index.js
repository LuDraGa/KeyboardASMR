import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS, SOUND_SETS } from '../../shared/config';

// State management
let isMuted = DEFAULT_SETTINGS.isMuted;
let currentSoundSet = DEFAULT_SETTINGS.soundSet;
let volume = DEFAULT_SETTINGS.volume;

// Audio context and buffers
let audioContext = null;
let soundBuffers = {};
let isAudioInitialized = false;

// Initialize Web Audio API
async function initAudio() {
  if (isAudioInitialized) return;
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await loadSounds();
    isAudioInitialized = true;
    console.log('Keyboard ASMR: Audio initialized successfully');
  } catch (error) {
    console.error('Keyboard ASMR: Failed to initialize audio:', error);
  }
}

// Load and cache sounds
async function loadSounds() {
  const loadSound = async (url) => {
    try {
      const response = await fetch(chrome.runtime.getURL(url));
      const arrayBuffer = await response.arrayBuffer();
      return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error(`Keyboard ASMR: Error loading sound: ${url}`, error);
      return null;
    }
  };

  // Load all sounds from configuration
  for (const [setName, sounds] of Object.entries(SOUND_SETS)) {
    soundBuffers[setName] = {};
    for (const [key, path] of Object.entries(sounds)) {
      soundBuffers[setName][key] = await loadSound(path);
    }
  }
}

// Play sound directly in content script
function playSound(key) {
  if (isMuted || !isAudioInitialized) return;

  const buffer = soundBuffers[currentSoundSet]?.[key] || soundBuffers[currentSoundSet]?.default;
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
  script.onload = function() {
    this.remove();
  };
  
  // Inject as early as possible
  (document.head || document.documentElement).appendChild(script);
}

// Alternative injection method using inline script
function injectInlineScript() {
  const scriptContent = `(${injectedFunction.toString()})();`;
  const script = document.createElement('script');
  script.textContent = scriptContent;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// The function to be injected (simplified version for inline injection)
function injectedFunction() {
  const MESSAGE_SOURCE = 'keyboard-asmr-injected';
  const DEBOUNCE_DELAY = 30;
  let lastKeyTime = 0;
  
  function handleKeyboardEvent(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    
    const currentTime = Date.now();
    if (currentTime - lastKeyTime < DEBOUNCE_DELAY) return;
    lastKeyTime = currentTime;
    
    window.postMessage({
      source: MESSAGE_SOURCE,
      type: 'KEYPRESS',
      data: { key: event.key, timestamp: currentTime }
    }, '*');
  }
  
  window.addEventListener('keydown', handleKeyboardEvent, true);
  document.addEventListener('keydown', handleKeyboardEvent, true);
}

// Stats tracking
let sessionStats = {
  keystrokes: 0,
  startTime: Date.now(),
  lastKeyTime: Date.now(),
  lastActiveTime: Date.now(),
  totalActiveTime: 0,
  keystrokesBuffer: [],
  currentWPM: 0
};

// Calculate WPM from recent keystrokes
function calculateWPM() {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  // Filter keystrokes within the last minute
  sessionStats.keystrokesBuffer = sessionStats.keystrokesBuffer.filter(time => time > oneMinuteAgo);
  
  if (sessionStats.keystrokesBuffer.length < 2) {
    return 0;
  }
  
  // Calculate WPM (average word = 5 characters)
  const charactersTyped = sessionStats.keystrokesBuffer.length;
  const words = charactersTyped / 5;
  return Math.round(words);
}

// Update daily stats
async function updateDailyStats() {
  const today = new Date().toDateString();
  const stats = await chrome.storage.local.get(STORAGE_KEYS.DAILY_STATS);
  const dailyStats = stats[STORAGE_KEYS.DAILY_STATS] || {};
  
  if (!dailyStats[today]) {
    dailyStats[today] = {
      keystrokes: 0,
      activeTime: 0,
      peakWPM: 0
    };
  }
  
  dailyStats[today].keystrokes++;
  sessionStats.keystrokes++;
  
  // Track active time
  const currentTime = Date.now();
  const timeSinceLastKey = currentTime - sessionStats.lastKeyTime;
  
  // If less than 5 seconds since last keystroke, consider it active time
  if (timeSinceLastKey < 5000) {
    const activeIncrement = Math.min(timeSinceLastKey, 5000) / 1000 / 60; // Convert to minutes
    sessionStats.totalActiveTime += activeIncrement;
  } else {
    // Reset active time tracking after inactivity
    sessionStats.lastActiveTime = currentTime;
  }
  
  sessionStats.lastKeyTime = currentTime;
  
  // Add to keystroke buffer for WPM calculation
  sessionStats.keystrokesBuffer.push(currentTime);
  
  // Calculate current WPM
  const currentWPM = calculateWPM();
  sessionStats.currentWPM = currentWPM;
  
  // Update peak WPM if current is higher
  if (currentWPM > dailyStats[today].peakWPM) {
    dailyStats[today].peakWPM = currentWPM;
  }
  
  // Update active time in storage
  dailyStats[today].activeTime = Math.round(sessionStats.totalActiveTime + (dailyStats[today].activeTime || 0));
  
  // Clean up old stats (keep only last 7 days)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  Object.keys(dailyStats).forEach(date => {
    if (new Date(date) < oneWeekAgo) {
      delete dailyStats[date];
    }
  });
  
  await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_STATS]: dailyStats });
}

// Listen for messages from injected script
window.addEventListener('message', async (event) => {
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
      playSound(event.data.data.key);
    }
    
    // Update stats regardless of mute state
    updateDailyStats();
    
    // Also notify background for icon updates (optional)
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.KEYPRESS,
      key: event.data.data.key,
    }).catch(() => {
      // Ignore errors if background is not available
    });
  }
});

// Load initial settings
chrome.storage.sync.get([STORAGE_KEYS.SOUND_SET, STORAGE_KEYS.VOLUME, STORAGE_KEYS.IS_MUTED], async (result) => {
  currentSoundSet = result[STORAGE_KEYS.SOUND_SET] || DEFAULT_SETTINGS.soundSet;
  volume = result[STORAGE_KEYS.VOLUME] !== undefined ? result[STORAGE_KEYS.VOLUME] / 100 : DEFAULT_SETTINGS.volume;
  isMuted = result[STORAGE_KEYS.IS_MUTED] ?? DEFAULT_SETTINGS.isMuted;
  
  // Initialize audio if not muted
  if (!isMuted) {
    await initAudio();
  }
});

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
      // Initialize audio when unmuted
      if (!isMuted && !isAudioInitialized) {
        await initAudio();
      }
    }
  }
});

// Listen for state changes from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.STATE_CHANGE) {
    isMuted = message.isMuted;
    if (!isMuted && !isAudioInitialized) {
      initAudio();
    }
  }
});

// Fallback: Also listen for keyboard events directly (for sites where injection fails)
document.addEventListener('keydown', async (event) => {
  if (isMuted) return;
  
  // Initialize audio on first keypress if needed
  if (!isAudioInitialized) {
    await initAudio();
  }
  
  playSound(event.key);
  
  // Notify background
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.KEYPRESS,
    key: event.key,
  }).catch(() => {});
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

console.log('Keyboard ASMR: Content script loaded');