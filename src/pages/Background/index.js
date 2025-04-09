import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } from '../../shared/config';

console.log('Background service worker initialized');

let currentSoundSet = DEFAULT_SETTINGS.soundSet;
let volume = DEFAULT_SETTINGS.volume;
let isMuted = DEFAULT_SETTINGS.isMuted;

// Create the offscreen document if it doesn't exist
async function createOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Playing keyboard sound effects',
  });
}

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

// Play sound through the offscreen document
async function playSound(key) {
  if (isMuted) return;

  try {
    await createOffscreenDocument();
    // Get the offscreen document's tab
    const offscreenClient = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (offscreenClient.length > 0) {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: MESSAGE_TYPES.PLAY_SOUND,
        soundSet: currentSoundSet,
        key: key,
        volume: volume,
      });
    } else {
      console.error('Offscreen document not found');
    }
  } catch (error) {
    console.error('Failed to play sound:', error);
  }
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

// Listen for the keyboard command
chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    isMuted = !isMuted;
    updateExtensionState();

    // Show a notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: isMuted ? 'icon-34-disabled.png' : 'icon-34.png',
      title: 'Keyboard ASMR',
      message: `Keyboard sounds ${isMuted ? 'disabled' : 'enabled'}`,
    });
  }
});

// Initialize settings
chrome.storage.sync.get([STORAGE_KEYS.SOUND_SET, STORAGE_KEYS.VOLUME, STORAGE_KEYS.IS_MUTED], async (result) => {
  currentSoundSet = result[STORAGE_KEYS.SOUND_SET] || DEFAULT_SETTINGS.soundSet;
  volume = result[STORAGE_KEYS.VOLUME] !== undefined ? result[STORAGE_KEYS.VOLUME] / 100 : DEFAULT_SETTINGS.volume;
  isMuted = result[STORAGE_KEYS.IS_MUTED] ?? DEFAULT_SETTINGS.isMuted;

  // Initialize offscreen document
  await createOffscreenDocument();
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
