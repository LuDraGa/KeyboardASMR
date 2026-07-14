import {
  DEFAULT_SETTINGS,
  MESSAGE_TYPES,
  STORAGE_KEYS,
  resolveSoundSetId,
} from '../../shared/config';
import { selectLatestActiveVolume } from '../../shared/analyticsValues';
import { getKeyPlaybackInfo, getPlaybackCandidates } from '../../shared/keyCategories';
import {
  resolvePlaybackMapping,
  startLoadingPlaybackMappings,
} from '../../shared/playbackMapping';
import { profileLoader } from '../../utils/profileLoader';

// State management
let isMuted = DEFAULT_SETTINGS.isMuted;
let currentSoundSet = resolveSoundSetId(DEFAULT_SETTINGS.soundSet);
let volume = DEFAULT_SETTINGS.volume;

// Audio context and buffers
let audioContext = null;
const soundBuffers = {};
const decodedAudioCache = new Map();
const loadingProfiles = new Map();
let isAudioInitialized = false;
let audioInitPromise = null;
let audioContextResumed = false;
let activeSoundSet = null;
let pendingSoundSet = null;
let soundLoadToken = 0;
let compatibilityModes = [];

let resolveInitialSettingsReady;
const initialSettingsReady = new Promise(resolve => {
  resolveInitialSettingsReady = resolve;
});
let initialSettingsLoaded = false;

// Track whether injected script is active to prevent duplicate events
let injectedScriptActive = false;
let fallbackListenersEnabled = false;
const FALLBACK_TIMEOUT = 500; // Enable fallback if no heartbeat after 500ms
const ANALYTICS_USAGE_CHECKPOINT_KEY_THRESHOLD = 1000;
const ANALYTICS_USAGE_CHECKPOINT_INTERVAL = 15 * 60 * 1000;

const runtimeStats = {
  contentScriptStartedAt: new Date().toISOString(),
  loadedSoundCount: 0,
  failedSoundCount: 0,
  loadAttemptCount: 0,
  keyEventCount: 0,
  playedSoundCount: 0,
  playbackAttemptCount: 0,
  playbackFailureCount: 0,
  playbackFailuresBeforeFirstSoundCount: 0,
  mutedKeyEventCount: 0,
  unmappedEventCount: 0,
  firstSoundSuccessCount: 0,
  audioInitFailureCount: 0,
  audioResumeFailureCount: 0,
  soundFetchFailureCount: 0,
  decodeFailureCount: 0,
  profileLoadFailureCount: 0,
  soundPlayFailureCount: 0,
  injectionFallbackCount: 0,
  firstEventAt: null,
  firstSoundAt: null,
  firstSoundLatencyMs: null,
  firstSoundFailureCode: null,
  keyCategoryCounts: {},
  lastEventAt: null,
  lastSoundAt: null,
  lastErrorCode: null,
  lastErrorAt: null,
  lastErrorContext: null,
  errorCounts: {},
};

const pendingAnalyticsUsage = {};
let pendingAnalyticsCapturedEvents = 0;
let analyticsFlushTimer = null;
const PROFILE_USAGE_COUNT_FIELDS = [
  'keyEventCount',
  'playedSoundCount',
  'playbackAttemptCount',
  'playbackFailureCount',
  'mutedKeyEventCount',
  'unmappedEventCount',
  'firstSoundSuccessCount',
];

function recordError(code, context = null) {
  runtimeStats.errorCounts[code] = (runtimeStats.errorCounts[code] || 0) + 1;
  runtimeStats.lastErrorCode = code;
  runtimeStats.lastErrorAt = new Date().toISOString();
  runtimeStats.lastErrorContext = context;
}

function recordKeyEvent(keyCategory = 'unknown') {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();

  runtimeStats.keyEventCount += 1;
  runtimeStats.keyCategoryCounts[keyCategory] =
    (runtimeStats.keyCategoryCounts[keyCategory] || 0) + 1;
  runtimeStats.lastEventAt = timestamp;

  if (!runtimeStats.firstEventAt) {
    runtimeStats.firstEventAt = timestamp;
  }
}

function getUsageProfileId() {
  return activeSoundSet || currentSoundSet || 'unknown';
}

function createEmptyProfileUsage() {
  return {
    ...Object.fromEntries(PROFILE_USAGE_COUNT_FIELDS.map(field => [field, 0])),
    activeVolume: null,
  };
}

function mergeProfileUsage(target, delta) {
  for (const field of PROFILE_USAGE_COUNT_FIELDS) {
    target[field] += delta[field] || 0;
  }
  target.activeVolume = selectLatestActiveVolume(target.activeVolume, delta.activeVolume);
}

function getPendingProfileUsage(profileId = getUsageProfileId()) {
  pendingAnalyticsUsage[profileId] ||= createEmptyProfileUsage();
  return pendingAnalyticsUsage[profileId];
}

function queueAnalyticsUsageFlush() {
  if (analyticsFlushTimer) return;

  analyticsFlushTimer = setTimeout(() => {
    flushAnalyticsUsage();
  }, ANALYTICS_USAGE_CHECKPOINT_INTERVAL);
}

function recordAnalyticsUsageDelta(delta) {
  const usage = getPendingProfileUsage();
  mergeProfileUsage(usage, delta);

  pendingAnalyticsCapturedEvents += (delta.keyEventCount || 0) + (delta.mutedKeyEventCount || 0);

  if (pendingAnalyticsCapturedEvents >= ANALYTICS_USAGE_CHECKPOINT_KEY_THRESHOLD) {
    flushAnalyticsUsage();
  } else {
    queueAnalyticsUsageFlush();
  }
}

function restoreAnalyticsUsage(profileDeltas) {
  for (const [profileId, delta] of Object.entries(profileDeltas)) {
    pendingAnalyticsUsage[profileId] ||= createEmptyProfileUsage();
    mergeProfileUsage(pendingAnalyticsUsage[profileId], delta);
    pendingAnalyticsCapturedEvents += (delta.keyEventCount || 0) + (delta.mutedKeyEventCount || 0);
  }
}

function flushAnalyticsUsage() {
  if (analyticsFlushTimer) {
    clearTimeout(analyticsFlushTimer);
    analyticsFlushTimer = null;
  }

  if (Object.keys(pendingAnalyticsUsage).length === 0) {
    return;
  }

  const profileDeltas = {};
  for (const [profileId, delta] of Object.entries(pendingAnalyticsUsage)) {
    profileDeltas[profileId] = { ...delta };
    delete pendingAnalyticsUsage[profileId];
  }
  pendingAnalyticsCapturedEvents = 0;

  try {
    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.ANALYTICS_PROFILE_USAGE_DELTA,
        profileDeltas,
      },
      () => {
        if (chrome.runtime.lastError) {
          restoreAnalyticsUsage(profileDeltas);
          queueAnalyticsUsageFlush();
        }
      }
    );
  } catch (error) {
    restoreAnalyticsUsage(profileDeltas);
    queueAnalyticsUsageFlush();
  }
}

function recordPlaybackAttempt() {
  runtimeStats.playbackAttemptCount += 1;
  recordAnalyticsUsageDelta({ playbackAttemptCount: 1 });
}

function recordPlaybackFailure(reason) {
  runtimeStats.playbackFailureCount += 1;
  recordAnalyticsUsageDelta({ playbackFailureCount: 1 });

  if (!runtimeStats.firstSoundAt) {
    runtimeStats.playbackFailuresBeforeFirstSoundCount += 1;
    runtimeStats.firstSoundFailureCode = runtimeStats.firstSoundFailureCode || reason;
  }
}

function recordMutedKeyEvent() {
  runtimeStats.mutedKeyEventCount += 1;
  recordAnalyticsUsageDelta({ mutedKeyEventCount: 1 });
}

function recordUnmappedEvent() {
  runtimeStats.unmappedEventCount += 1;
  recordAnalyticsUsageDelta({ unmappedEventCount: 1 });
}

function recordPlayedSound() {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();

  runtimeStats.playedSoundCount += 1;
  runtimeStats.lastSoundAt = timestamp;
  recordAnalyticsUsageDelta({
    playedSoundCount: 1,
    activeVolume: {
      volumePercent: Math.round(volume * 100),
      usedAt: now,
    },
  });

  if (!runtimeStats.firstSoundAt) {
    runtimeStats.firstSoundAt = timestamp;
    runtimeStats.firstSoundSuccessCount += 1;
    recordAnalyticsUsageDelta({ firstSoundSuccessCount: 1 });
    runtimeStats.firstSoundLatencyMs = runtimeStats.firstEventAt
      ? now - Date.parse(runtimeStats.firstEventAt)
      : null;
  }
}

function getContentStatus() {
  const selectedProfileLoaded = Boolean(
    soundBuffers[currentSoundSet] && !loadingProfiles.has(currentSoundSet)
  );
  const activeProfileLoaded = Boolean(
    activeSoundSet && soundBuffers[activeSoundSet] && !loadingProfiles.has(activeSoundSet)
  );

  return {
    ok: true,
    muted: isMuted,
    volumePercent: Math.round(volume * 100),
    selectedProfile: currentSoundSet,
    activeProfile: activeSoundSet,
    pendingProfile: pendingSoundSet,
    selectedProfileLoaded,
    activeProfileLoaded,
    profileLoading: Boolean(pendingSoundSet || loadingProfiles.size),
    loadedProfileCount: Object.keys(soundBuffers).length,
    audioInitialized: isAudioInitialized,
    audioContextState: audioContext?.state || 'none',
    audioContextResumed,
    compatibilityModes,
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
  if (audioInitPromise) return await audioInitPromise;

  audioInitPromise = (async () => {
    try {
      if (!initialSettingsLoaded) {
        await initialSettingsReady;
      }

      // Create AudioContext in suspended state (allowed without user gesture)
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      isAudioInitialized = true;
      activateSoundSet(currentSoundSet);
      await loadingProfiles.get(currentSoundSet)?.mappingsReady;
      console.log('Keyboard ASMR: Audio initialized successfully');
    } catch (error) {
      runtimeStats.audioInitFailureCount += 1;
      recordError('audio_init_failed');
      if (!audioContext) {
        isAudioInitialized = false;
      }
      console.error('Keyboard ASMR: Failed to initialize audio:', error);
    } finally {
      audioInitPromise = null;
    }
  })();

  await audioInitPromise;
}

// Resume AudioContext on first user interaction
async function ensureAudioContextResumed() {
  if (!audioContext) return false;
  if (audioContext.state === 'running') {
    audioContextResumed = true;
    return true;
  }

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    audioContextResumed = audioContext.state === 'running';
    if (audioContextResumed) {
      console.log('Keyboard ASMR: AudioContext resumed');
    }
    return audioContextResumed;
  } catch (error) {
    runtimeStats.audioResumeFailureCount += 1;
    recordError('audio_resume_failed');
    console.error('Keyboard ASMR: Failed to resume AudioContext:', error);
    return false;
  }
}

function resolveAudioRequestUrl(url) {
  if (/^(https?:|data:|blob:)/.test(url)) {
    return url;
  }

  return chrome.runtime.getURL(url);
}

async function loadSound(url) {
  const requestUrl = resolveAudioRequestUrl(url);

  if (decodedAudioCache.has(requestUrl)) {
    return decodedAudioCache.get(requestUrl);
  }

  let arrayBuffer;

  try {
    runtimeStats.loadAttemptCount += 1;
    const response = await fetch(requestUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    arrayBuffer = await response.arrayBuffer();
  } catch (error) {
    runtimeStats.failedSoundCount += 1;
    runtimeStats.soundFetchFailureCount += 1;
    recordError('sound_fetch_failed', {
      profile: pendingSoundSet || activeSoundSet || currentSoundSet,
      soundPath: url,
    });
    console.error(`Keyboard ASMR: Error fetching sound: ${url}`, error);
    return null;
  }

  try {
    const decodedAudio = await audioContext.decodeAudioData(arrayBuffer);
    decodedAudioCache.set(requestUrl, decodedAudio);
    runtimeStats.loadedSoundCount += 1;
    return decodedAudio;
  } catch (error) {
    runtimeStats.failedSoundCount += 1;
    runtimeStats.decodeFailureCount += 1;
    recordError('sound_decode_failed', {
      profile: pendingSoundSet || activeSoundSet || currentSoundSet,
      soundPath: url,
    });
    console.error(`Keyboard ASMR: Error decoding sound: ${url}`, error);
    return null;
  }
}

async function startProfileBufferLoad(soundSetId) {
  const profile = await profileLoader.loadBundledProfileById(soundSetId);
  if (!profile) {
    throw new Error(`Profile not found: ${soundSetId}`);
  }

  const keyMappings = await profileLoader.profileToLegacyFormat(profile);
  return startLoadingPlaybackMappings(keyMappings, loadSound);
}

async function loadProfileBuffers(soundSetId) {
  const resolvedSoundSet = resolveSoundSetId(soundSetId);

  if (loadingProfiles.has(resolvedSoundSet)) {
    return await loadingProfiles.get(resolvedSoundSet).buffersReady;
  }

  if (soundBuffers[resolvedSoundSet]) {
    return soundBuffers[resolvedSoundSet];
  }

  const loadingSession = startProfileBufferLoad(resolvedSoundSet);
  const mappingsReady = loadingSession
    .then(({ mappings }) => {
      soundBuffers[resolvedSoundSet] = mappings;
      return mappings;
    })
    .catch(() => null);
  const buffersReady = loadingSession
    .then(async ({ buffersReady: pendingBuffers }) => {
      const mappings = await mappingsReady;
      await pendingBuffers;
      return mappings;
    })
    .catch(error => {
      delete soundBuffers[resolvedSoundSet];
      throw error;
    })
    .finally(() => {
      loadingProfiles.delete(resolvedSoundSet);
    });

  loadingProfiles.set(resolvedSoundSet, { mappingsReady, buffersReady });
  return await buffersReady;
}

async function activateSoundSet(soundSetId) {
  const resolvedSoundSet = resolveSoundSetId(soundSetId);
  const token = ++soundLoadToken;
  pendingSoundSet = resolvedSoundSet;

  try {
    await loadProfileBuffers(resolvedSoundSet);

    if (token !== soundLoadToken) {
      return false;
    }

    activeSoundSet = resolvedSoundSet;
    pendingSoundSet = null;
    console.log(`Keyboard ASMR: Activated sound profile ${resolvedSoundSet}`);
    return true;
  } catch (error) {
    runtimeStats.profileLoadFailureCount += 1;
    recordError('profile_load_failed', { profile: resolvedSoundSet });

    if (token === soundLoadToken) {
      pendingSoundSet = null;
    }

    console.error(`Keyboard ASMR: Failed to activate profile ${resolvedSoundSet}:`, error);
    return false;
  }
}

// Play sound directly in content script
async function playSound(playbackInfo, eventType = 'keydown') {
  const playbackSoundSet = activeSoundSet || currentSoundSet;
  const candidates = getPlaybackCandidates(playbackInfo);
  const profileLoad = loadingProfiles.get(playbackSoundSet);
  const profileMappings =
    soundBuffers[playbackSoundSet] || (await profileLoad?.mappingsReady) || null;
  const mapping = resolvePlaybackMapping(profileMappings, candidates, eventType);

  if (mapping.status === 'profile_unavailable') {
    recordError('profile_not_loaded', { profile: playbackSoundSet });
    return;
  }

  if (mapping.status === 'unmapped') {
    recordUnmappedEvent();
    return;
  }

  recordPlaybackAttempt();

  if (!mapping.buffer) {
    recordPlaybackFailure('buffer_unavailable');
    return;
  }

  if (!isAudioInitialized || !audioContext) {
    recordPlaybackFailure(!audioContext ? 'audio_context_missing' : 'audio_not_initialized');
    return;
  }

  if (!(await ensureAudioContextResumed())) {
    recordPlaybackFailure('audio_context_not_running');
    return;
  }

  try {
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    source.buffer = mapping.buffer;
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start(0);
    recordPlayedSound();
  } catch (error) {
    runtimeStats.soundPlayFailureCount += 1;
    recordError('sound_play_failed');
    recordPlaybackFailure('sound_play_failed');
    console.error('Keyboard ASMR: Error playing sound:', error);
  }
}

async function handleCapturedKeyEvent(playbackInfo, eventType) {
  recordKeyEvent(playbackInfo.keyCategory);

  if (isMuted) {
    recordMutedKeyEvent();
    return;
  }

  recordAnalyticsUsageDelta({ keyEventCount: 1 });

  if (!isAudioInitialized) {
    await initAudio();
  }

  await playSound(playbackInfo, eventType || 'keydown');
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
      compatibilityModes = event.data?.data?.modes || [];
      console.log('Keyboard ASMR: Injected script confirmed active, disabling fallback listeners');
      return;
    }

    if (event.data?.type === 'COMPATIBILITY_STATUS') {
      compatibilityModes = event.data?.data?.modes || [];
      return;
    }

    // Handle keypress events
    if (event.data?.type === 'KEYPRESS') {
      const keyEventData = event.data.data || {};
      const { eventType, keyCategory, playbackKey, location } = keyEventData;
      const playbackInfo = playbackKey
        ? { playbackKey, keyCategory, location }
        : getKeyPlaybackInfo(keyEventData);
      await handleCapturedKeyEvent(playbackInfo, eventType || 'keydown');
    }
  }
});

// Load initial settings
chrome.storage.sync.get(
  [STORAGE_KEYS.SOUND_SET, STORAGE_KEYS.VOLUME, STORAGE_KEYS.IS_MUTED],
  result => {
    currentSoundSet = resolveSoundSetId(
      result[STORAGE_KEYS.SOUND_SET] || DEFAULT_SETTINGS.soundSet
    );
    volume =
      result[STORAGE_KEYS.VOLUME] !== undefined
        ? result[STORAGE_KEYS.VOLUME] / 100
        : DEFAULT_SETTINGS.volume;
    isMuted = result[STORAGE_KEYS.IS_MUTED] ?? DEFAULT_SETTINGS.isMuted;
    initialSettingsLoaded = true;
    resolveInitialSettingsReady();
  }
);

// Listen for setting changes
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync') {
    if (changes[STORAGE_KEYS.SOUND_SET]) {
      currentSoundSet = resolveSoundSetId(
        changes[STORAGE_KEYS.SOUND_SET].newValue || DEFAULT_SETTINGS.soundSet
      );

      if (isAudioInitialized) {
        await activateSoundSet(currentSoundSet);
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
  const playbackInfo = getKeyPlaybackInfo(event);

  // Determine event type based on repeat flag
  const eventType = event.repeat ? 'keypress' : 'keydown';
  await handleCapturedKeyEvent(playbackInfo, eventType);
}

async function handleFallbackKeyup(event) {
  const playbackInfo = getKeyPlaybackInfo(event);
  await handleCapturedKeyEvent(playbackInfo, 'keyup');
}

// Enable fallback listeners only if injected script fails to load
function enableFallbackListeners() {
  if (fallbackListenersEnabled) return;

  fallbackListenersEnabled = true;
  runtimeStats.injectionFallbackCount += 1;
  console.log('Keyboard ASMR: Enabling fallback event listeners');
  document.addEventListener('keydown', handleFallbackKeydown, true);
  document.addEventListener('keyup', handleFallbackKeyup, true);
}

// Wait for injected script confirmation, enable fallback if timeout
setTimeout(() => {
  if (!injectedScriptActive) {
    console.log('Keyboard ASMR: Injected script not detected, using fallback listeners');
    enableFallbackListeners();
  }
}, FALLBACK_TIMEOUT);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushAnalyticsUsage();
  }
});

window.addEventListener('pagehide', flushAnalyticsUsage);

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
