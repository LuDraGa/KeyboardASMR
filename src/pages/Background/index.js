import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } from '../../shared/config';

console.log('Background service worker initialized');

// Note: currentSoundSet and volume are no longer needed in background
// since audio handling moved to content scripts
let isMuted = DEFAULT_SETTINGS.isMuted;

// Offscreen document no longer needed - audio is handled in content script
// Keeping this comment for reference of the old architecture

// Update extension icon state. Content scripts receive setting changes through
// chrome.storage.onChanged, so no tab/frame messaging is needed here.
function updateExtensionState() {
  const iconPath = isMuted ? 'icon-34-disabled.png' : 'icon-34.png';

  chrome.action.setIcon({
    path: iconPath,
  });
}

// Listen for popup state changes
chrome.runtime.onMessage.addListener(message => {
  if (message.type === MESSAGE_TYPES.TOGGLE_MUTE) {
    isMuted = message.isMuted;
    updateExtensionState();
  }
});

// Initialize settings
chrome.storage.sync.get(
  [STORAGE_KEYS.SOUND_SET, STORAGE_KEYS.VOLUME, STORAGE_KEYS.IS_MUTED],
  async result => {
    // Audio settings are now handled in content scripts
    // currentSoundSet and volume are no longer needed here
    isMuted = result[STORAGE_KEYS.IS_MUTED] ?? DEFAULT_SETTINGS.isMuted;

    // Offscreen document no longer needed as audio is handled in content script
    // await createOffscreenDocument();
    updateExtensionState();
  }
);

// Listen for setting changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    // Audio settings changes are handled in content scripts
    // No need to track currentSoundSet or volume in background
    if (changes[STORAGE_KEYS.IS_MUTED]) {
      isMuted = changes[STORAGE_KEYS.IS_MUTED].newValue;
      updateExtensionState();
    }
  }
});
