import {
  ANALYTICS_STORAGE_KEYS,
  DEFAULT_SETTINGS,
  MESSAGE_TYPES,
  STORAGE_KEYS,
} from '../../shared/config';
import { ANALYTICS_CONFIG, isAnalyticsConfigured } from '../../shared/analyticsConfig';

console.log('Background service worker initialized');

// Note: currentSoundSet and volume are no longer needed in background
// since audio handling moved to content scripts
let isMuted = DEFAULT_SETTINGS.isMuted;
let analyticsQueue = Promise.resolve();

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

function getLocalDateKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getVolumeBucket(volumePercent) {
  const volume = Number(volumePercent);
  if (!Number.isFinite(volume)) return 'unknown';
  if (volume === 0) return '0';
  if (volume <= 25) return '1_25';
  if (volume <= 50) return '26_50';
  if (volume <= 75) return '51_75';
  return '76_100';
}

function getLatencyBucket(latencyMs) {
  const latency = Number(latencyMs);
  if (!Number.isFinite(latency)) return 'unknown';
  if (latency <= 100) return '0_100ms';
  if (latency <= 500) return '101_500ms';
  if (latency <= 1000) return '501_1000ms';
  return '1000ms_plus';
}

function incrementCounter(target, key, amount = 1) {
  if (!key) return;
  const count = Number(amount);
  if (!Number.isFinite(count) || count <= 0) return;
  target[key] = (target[key] || 0) + count;
}

function getEmptyProfileBucket() {
  return {
    selectedCount: 0,
    previewedCount: 0,
    keyEventCount: 0,
    playedSoundCount: 0,
    droppedSoundCount: 0,
    firstSoundSuccessCount: 0,
  };
}

function getEmptyDailyBucket() {
  return {
    popup: {
      openCount: 0,
      profileSelectCount: 0,
      previewPlayCount: 0,
      muteToggleCount: 0,
      diagnosticCopyCount: 0,
      volumeChangeCount: 0,
    },
    profiles: {},
    statuses: {},
    statusReasons: {},
    captureModes: {},
    compatibilityModes: {},
    errors: {},
    volumeBuckets: {},
    firstSoundLatencyBuckets: {},
    lifecycle: {
      installCount: 0,
      updateCount: 0,
    },
  };
}

function getObjectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeProfileBucket(profileStats = {}) {
  return {
    ...getEmptyProfileBucket(),
    ...getObjectValue(profileStats),
  };
}

function normalizeDailyBucket(bucket = {}) {
  const safeBucket = getObjectValue(bucket);
  const emptyBucket = getEmptyDailyBucket();
  const normalizedProfiles = {};

  for (const [profileId, profileStats] of Object.entries(getObjectValue(safeBucket.profiles))) {
    normalizedProfiles[profileId] = normalizeProfileBucket(profileStats);
  }

  return {
    ...emptyBucket,
    ...safeBucket,
    popup: {
      ...emptyBucket.popup,
      ...getObjectValue(safeBucket.popup),
    },
    profiles: normalizedProfiles,
    statuses: getObjectValue(safeBucket.statuses),
    statusReasons: getObjectValue(safeBucket.statusReasons),
    captureModes: getObjectValue(safeBucket.captureModes),
    compatibilityModes: getObjectValue(safeBucket.compatibilityModes),
    errors: getObjectValue(safeBucket.errors),
    volumeBuckets: getObjectValue(safeBucket.volumeBuckets),
    firstSoundLatencyBuckets: getObjectValue(safeBucket.firstSoundLatencyBuckets),
    lifecycle: {
      ...emptyBucket.lifecycle,
      ...getObjectValue(safeBucket.lifecycle),
    },
  };
}

function getDailyBucket(state, dateKey = getLocalDateKey()) {
  state.version ||= 1;
  state.buckets ||= {};
  state.buckets[dateKey] = normalizeDailyBucket(state.buckets[dateKey]);
  return state.buckets[dateKey];
}

function getProfileBucket(bucket, profileId) {
  const key = profileId || 'unknown';
  bucket.profiles[key] = normalizeProfileBucket(bucket.profiles[key]);
  return bucket.profiles[key];
}

function pruneOldBuckets(state) {
  const today = getLocalDateKey();
  const cutoff = Date.now() - ANALYTICS_CONFIG.dailyRetentionDays * 24 * 60 * 60 * 1000;

  for (const dateKey of Object.keys(state.buckets || {})) {
    if (dateKey >= today) continue;
    if (Date.parse(`${dateKey}T00:00:00.000Z`) < cutoff) {
      delete state.buckets[dateKey];
    }
  }
}

async function getAnalyticsState() {
  const result = await chrome.storage.local.get([
    ANALYTICS_STORAGE_KEYS.DAILY_STATE,
    ANALYTICS_STORAGE_KEYS.LAST_FLUSH_DATE,
  ]);
  const storedState = getObjectValue(result[ANALYTICS_STORAGE_KEYS.DAILY_STATE]);
  const state = {
    version: 1,
    ...storedState,
    buckets: getObjectValue(storedState.buckets),
  };

  for (const dateKey of Object.keys(state.buckets)) {
    state.buckets[dateKey] = normalizeDailyBucket(state.buckets[dateKey]);
  }

  return {
    state,
    lastFlushDate: result[ANALYTICS_STORAGE_KEYS.LAST_FLUSH_DATE] || null,
  };
}

async function setAnalyticsState(state, lastFlushDate) {
  await chrome.storage.local.set({
    [ANALYTICS_STORAGE_KEYS.DAILY_STATE]: state,
    [ANALYTICS_STORAGE_KEYS.LAST_FLUSH_DATE]: lastFlushDate,
  });
}

function enqueueAnalyticsUpdate(task) {
  analyticsQueue = analyticsQueue.then(task).catch(error => {
    console.warn('Keyboard ASMR: analytics update failed', error);
  });
}

async function getOrCreateAnalyticsClientId() {
  const result = await chrome.storage.local.get(ANALYTICS_STORAGE_KEYS.CLIENT_ID);
  let clientId = result[ANALYTICS_STORAGE_KEYS.CLIENT_ID];

  if (!clientId) {
    const randomPart =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
        : Math.random().toString().slice(2, 12);
    clientId = `${randomPart}.${Math.floor(Date.now() / 1000)}`;
    await chrome.storage.local.set({ [ANALYTICS_STORAGE_KEYS.CLIENT_ID]: clientId });
  }

  return clientId;
}

function buildAnalyticsEventsForDate(dateKey, bucket) {
  const events = [];
  const normalizedBucket = normalizeDailyBucket(bucket);
  const baseParams = {
    event_date: dateKey,
    engagement_time_msec: 100,
    session_id: dateKey.replace(/-/g, ''),
  };

  if (
    normalizedBucket.popup.openCount ||
    normalizedBucket.popup.profileSelectCount ||
    normalizedBucket.popup.previewPlayCount ||
    normalizedBucket.popup.muteToggleCount ||
    normalizedBucket.popup.diagnosticCopyCount ||
    normalizedBucket.popup.volumeChangeCount
  ) {
    events.push({
      name: 'daily_popup_usage',
      params: {
        ...baseParams,
        popup_open_count: normalizedBucket.popup.openCount,
        profile_select_count: normalizedBucket.popup.profileSelectCount,
        preview_play_count: normalizedBucket.popup.previewPlayCount,
        mute_toggle_count: normalizedBucket.popup.muteToggleCount,
        diagnostic_copy_count: normalizedBucket.popup.diagnosticCopyCount,
        volume_change_count: normalizedBucket.popup.volumeChangeCount,
      },
    });
  }

  if (normalizedBucket.lifecycle.installCount || normalizedBucket.lifecycle.updateCount) {
    events.push({
      name: 'daily_extension_lifecycle',
      params: {
        ...baseParams,
        install_count: normalizedBucket.lifecycle.installCount,
        update_count: normalizedBucket.lifecycle.updateCount,
      },
    });
  }

  for (const [profileId, profileStats] of Object.entries(normalizedBucket.profiles)) {
    events.push({
      name: 'daily_profile_usage',
      params: {
        ...baseParams,
        profile_id: profileId,
        selected_count: profileStats.selectedCount || 0,
        previewed_count: profileStats.previewedCount || 0,
        key_event_count: profileStats.keyEventCount || 0,
        played_sound_count: profileStats.playedSoundCount || 0,
        dropped_sound_count: profileStats.droppedSoundCount || 0,
        first_sound_success_count: profileStats.firstSoundSuccessCount || 0,
      },
    });
  }

  for (const [statusState, count] of Object.entries(normalizedBucket.statuses)) {
    events.push({
      name: 'daily_status_result',
      params: {
        ...baseParams,
        status_state: statusState,
        status_count: count,
      },
    });
  }

  for (const [statusReason, count] of Object.entries(normalizedBucket.statusReasons)) {
    events.push({
      name: 'daily_status_reason',
      params: {
        ...baseParams,
        status_reason: statusReason,
        reason_count: count,
      },
    });
  }

  for (const [captureMode, count] of Object.entries(normalizedBucket.captureModes)) {
    events.push({
      name: 'daily_capture_mode',
      params: {
        ...baseParams,
        capture_mode: captureMode,
        mode_count: count,
      },
    });
  }

  for (const [compatibilityMode, count] of Object.entries(normalizedBucket.compatibilityModes)) {
    events.push({
      name: 'daily_compatibility_mode',
      params: {
        ...baseParams,
        compatibility_mode: compatibilityMode,
        mode_count: count,
      },
    });
  }

  for (const [errorClass, count] of Object.entries(normalizedBucket.errors)) {
    events.push({
      name: 'daily_error_class',
      params: {
        ...baseParams,
        error_class: errorClass,
        error_count: count,
      },
    });
  }

  for (const [volumeBucket, count] of Object.entries(normalizedBucket.volumeBuckets)) {
    events.push({
      name: 'daily_volume_bucket',
      params: {
        ...baseParams,
        volume_bucket: volumeBucket,
        volume_count: count,
      },
    });
  }

  for (const [latencyBucket, count] of Object.entries(normalizedBucket.firstSoundLatencyBuckets)) {
    events.push({
      name: 'daily_first_sound_latency',
      params: {
        ...baseParams,
        latency_bucket: latencyBucket,
        latency_count: count,
      },
    });
  }

  return events;
}

async function sendAnalyticsEvents(events) {
  if (events.length === 0) {
    return true;
  }

  if (!isAnalyticsConfigured()) {
    return false;
  }

  const clientId = await getOrCreateAnalyticsClientId();
  const endpoint = `${ANALYTICS_CONFIG.endpoint}?measurement_id=${encodeURIComponent(
    ANALYTICS_CONFIG.measurementId
  )}&api_secret=${encodeURIComponent(ANALYTICS_CONFIG.apiSecret)}`;

  for (let index = 0; index < events.length; index += 25) {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        events: events.slice(index, index + 25),
      }),
    });

    if (!response.ok) {
      throw new Error(`GA4 Measurement Protocol failed: HTTP ${response.status}`);
    }
  }

  return true;
}

async function flushDueAnalyticsBuckets() {
  const today = getLocalDateKey();
  const { state, lastFlushDate } = await getAnalyticsState();

  pruneOldBuckets(state);

  if (lastFlushDate === today) {
    await setAnalyticsState(state, lastFlushDate);
    return;
  }

  if (!isAnalyticsConfigured()) {
    await setAnalyticsState(state, lastFlushDate);
    return;
  }

  const datesToFlush = Object.keys(state.buckets || {})
    .filter(dateKey => dateKey < today)
    .sort();

  for (const dateKey of datesToFlush) {
    state.buckets[dateKey] = normalizeDailyBucket(state.buckets[dateKey]);
    const events = buildAnalyticsEventsForDate(dateKey, state.buckets[dateKey]);
    const sent = await sendAnalyticsEvents(events);
    if (sent) {
      delete state.buckets[dateKey];
    }
  }

  await setAnalyticsState(state, today);
}

async function recordAnalyticsEvent(eventName, params = {}) {
  const { state, lastFlushDate } = await getAnalyticsState();
  const bucket = getDailyBucket(state);

  switch (eventName) {
    case 'popup_open':
      bucket.popup.openCount += 1;
      break;
    case 'profile_previewed':
      bucket.popup.previewPlayCount += 1;
      getProfileBucket(bucket, params.profileId).previewedCount += 1;
      break;
    case 'profile_selected':
      bucket.popup.profileSelectCount += 1;
      getProfileBucket(bucket, params.profileId).selectedCount += 1;
      break;
    case 'mute_toggled':
      bucket.popup.muteToggleCount += 1;
      break;
    case 'diagnostic_copied':
      bucket.popup.diagnosticCopyCount += 1;
      break;
    case 'volume_changed':
      bucket.popup.volumeChangeCount += 1;
      incrementCounter(bucket.volumeBuckets, getVolumeBucket(params.volumePercent));
      break;
    case 'status_result':
      incrementCounter(bucket.statuses, params.statusState || 'unknown');
      incrementCounter(bucket.statusReasons, params.reason || 'none');
      incrementCounter(bucket.captureModes, params.captureMode || 'unknown');
      for (const mode of Array.isArray(params.compatibilityModes)
        ? params.compatibilityModes
        : []) {
        incrementCounter(bucket.compatibilityModes, mode);
      }
      if (params.errorClass) {
        incrementCounter(bucket.errors, params.errorClass);
      }
      if (params.firstSoundLatencyMs !== undefined && params.firstSoundLatencyMs !== null) {
        incrementCounter(
          bucket.firstSoundLatencyBuckets,
          getLatencyBucket(params.firstSoundLatencyMs)
        );
      }
      break;
    case 'extension_lifecycle':
      bucket.lifecycle ||= { installCount: 0, updateCount: 0 };
      if (params.reason === 'install') {
        bucket.lifecycle.installCount += 1;
      } else if (params.reason === 'update') {
        bucket.lifecycle.updateCount += 1;
      }
      break;
    default:
      break;
  }

  pruneOldBuckets(state);
  await setAnalyticsState(state, lastFlushDate);

  if (isAnalyticsConfigured() && lastFlushDate !== getLocalDateKey()) {
    await flushDueAnalyticsBuckets();
  }
}

async function recordProfileUsageDelta(profileDeltas = {}) {
  const { state, lastFlushDate } = await getAnalyticsState();
  const bucket = getDailyBucket(state);

  for (const [profileId, delta = {}] of Object.entries(profileDeltas || {})) {
    const profileBucket = getProfileBucket(bucket, profileId);
    profileBucket.keyEventCount += delta.keyEventCount || 0;
    profileBucket.playedSoundCount += delta.playedSoundCount || 0;
    profileBucket.droppedSoundCount += delta.droppedSoundCount || 0;
    profileBucket.firstSoundSuccessCount += delta.firstSoundSuccessCount || 0;
  }

  pruneOldBuckets(state);
  await setAnalyticsState(state, lastFlushDate);

  if (isAnalyticsConfigured() && lastFlushDate !== getLocalDateKey()) {
    await flushDueAnalyticsBuckets();
  }
}

// Listen for popup state changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.TOGGLE_MUTE) {
    isMuted = message.isMuted;
    updateExtensionState();
    sendResponse?.({ ok: true });
    return;
  }

  if (message.type === MESSAGE_TYPES.ANALYTICS_EVENT) {
    enqueueAnalyticsUpdate(() => recordAnalyticsEvent(message.eventName, message.params));
    sendResponse?.({ ok: true });
    return;
  }

  if (message.type === MESSAGE_TYPES.ANALYTICS_PROFILE_USAGE_DELTA) {
    enqueueAnalyticsUpdate(() => recordProfileUsageDelta(message.profileDeltas));
    sendResponse?.({ ok: true });
  }
});

chrome.runtime.onInstalled.addListener(details => {
  enqueueAnalyticsUpdate(() =>
    recordAnalyticsEvent('extension_lifecycle', {
      reason: details.reason,
    })
  );
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
    enqueueAnalyticsUpdate(flushDueAnalyticsBuckets);
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
