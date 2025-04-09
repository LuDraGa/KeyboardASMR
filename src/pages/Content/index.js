import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } from '../../shared/config';

// We only need to track mute state in content script
let isMuted = DEFAULT_SETTINGS.isMuted;

// Load the initial mute state
chrome.storage.sync.get([STORAGE_KEYS.IS_MUTED], (result) => {
  isMuted = result[STORAGE_KEYS.IS_MUTED] ?? DEFAULT_SETTINGS.isMuted;
});

// Forward keyboard events to background script
document.addEventListener('keydown', (event) => {
  if (isMuted) return;

  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.KEYPRESS,
    key: event.key,
  });
});

// Listen for state changes from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.STATE_CHANGE) {
    isMuted = message.isMuted;
  }
});
