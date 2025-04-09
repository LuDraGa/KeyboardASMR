import { SOUND_SETS, MESSAGE_TYPES } from '../../shared/config';

let audioContext = null;
let soundBuffers = {};
let volume = 0.7;

// Initialize audio context
async function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await loadSounds();
  } catch (error) {
    console.error('Failed to initialize audio:', error);
  }
}

// Load and cache sounds
async function loadSounds() {
  // Function to fetch and decode audio
  const loadSound = async (url) => {
    try {
      const response = await fetch(chrome.runtime.getURL(url));
      const arrayBuffer = await response.arrayBuffer();
      return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error(`Error loading sound: ${url}`, error);
      return null;
    }
  };

  // Load all sounds from the shared configuration
  for (const [setName, sounds] of Object.entries(SOUND_SETS)) {
    soundBuffers[setName] = {};
    for (const [key, path] of Object.entries(sounds)) {
      soundBuffers[setName][key] = await loadSound(path);
    }
  }
}

// Play sound function
function playSound(soundSet, key, volume) {
  const buffer = soundBuffers[soundSet]?.[key] || soundBuffers[soundSet]?.default;
  if (!buffer || !audioContext) return;

  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();

  source.buffer = buffer;
  gainNode.gain.value = volume;

  source.connect(gainNode);
  gainNode.connect(audioContext.destination);

  source.start(0);
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages targeted for the offscreen page
  if (message.target !== 'offscreen') return;

  if (message.type === MESSAGE_TYPES.PLAY_SOUND) {
    try {
      playSound(message.soundSet, message.key, message.volume);
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error playing sound:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  // Return true to indicate we will send a response asynchronously
  return true;
});

// Initialize audio context when the page loads
initAudio();
