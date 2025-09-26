import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } from '../../shared/config';

console.log('Background service worker initialized');

let currentSoundSet = DEFAULT_SETTINGS.soundSet;
let volume = DEFAULT_SETTINGS.volume;
let isMuted = DEFAULT_SETTINGS.isMuted;

// Offscreen document no longer needed - audio is handled in content script
// Keeping this comment for reference of the old architecture

// Update extension icon and state
async function updateExtensionState() {
  const iconPath = isMuted ? 'icon-34-disabled.png' : 'icon-34.png';

  chrome.action.setIcon({
    path: iconPath,
  });

  // Notify ALL tabs and their frames about the state change
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      // Send message to the main frame
      await chrome.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.STATE_CHANGE,
        isMuted: isMuted,
      });

      // Get all frames in the tab
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      if (frames) {
        // Send message to each frame except the main frame (which we already messaged)
        for (const frame of frames) {
          if (frame.frameId !== 0) {
            // frameId 0 is the main frame
            await chrome.tabs
              .sendMessage(
                tab.id,
                {
                  type: MESSAGE_TYPES.STATE_CHANGE,
                  isMuted: isMuted,
                },
                { frameId: frame.frameId }
              )
              .catch(() => {
                // Ignore errors for inactive frames
              });
          }
        }
      }
    } catch (error) {
      // Ignore errors for inactive tabs/frames
      console.debug(`Could not update state for tab ${tab.id}:`, error);
    }
  }
}

// Note: Sound playing is now handled directly in content script for better performance
// This function is kept for backwards compatibility but is no longer the primary method
async function playSound(key) {
  // Sound playing moved to content script for better performance
  // This is now just a stub for any legacy code
  return;
}

// Listen for keyboard events from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.KEYPRESS) {
    playSound(message.key);
  } else if (message.type === MESSAGE_TYPES.TOGGLE_MUTE) {
    isMuted = message.isMuted;
    updateExtensionState();
  }
  return true;
});

// Initialize settings
chrome.storage.sync.get([STORAGE_KEYS.SOUND_SET, STORAGE_KEYS.VOLUME, STORAGE_KEYS.IS_MUTED], async (result) => {
  currentSoundSet = result[STORAGE_KEYS.SOUND_SET] || DEFAULT_SETTINGS.soundSet;
  volume = result[STORAGE_KEYS.VOLUME] !== undefined ? result[STORAGE_KEYS.VOLUME] / 100 : DEFAULT_SETTINGS.volume;
  isMuted = result[STORAGE_KEYS.IS_MUTED] ?? DEFAULT_SETTINGS.isMuted;

  // Offscreen document no longer needed as audio is handled in content script
  // await createOffscreenDocument();
  updateExtensionState();
});

// Listen for setting changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes[STORAGE_KEYS.SOUND_SET]) {
      currentSoundSet = changes[STORAGE_KEYS.SOUND_SET].newValue;
    }
    if (changes[STORAGE_KEYS.VOLUME]) {
      volume = changes[STORAGE_KEYS.VOLUME].newValue / 100;
    }
    if (changes[STORAGE_KEYS.IS_MUTED]) {
      isMuted = changes[STORAGE_KEYS.IS_MUTED].newValue;
      updateExtensionState();
    }
  }
});
