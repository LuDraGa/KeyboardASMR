import {
  ANALYTICS_STORAGE_KEYS,
  DIAGNOSTICS_CONFIG,
  DEFAULT_SETTINGS,
  MESSAGE_TYPES,
  STORAGE_KEYS,
  isDiagnosticUploadConfigured,
} from '../../shared/config';
import { ANALYTICS_CONFIG, isAnalyticsConfigured } from '../../shared/analyticsConfig';
import { aggregateRuntimeErrorDeltas } from '../../shared/statusTelemetry';

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

function toAnalyticsDimension(value, fallback = 'unknown') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function toAnalyticsMetric(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
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
    statusErrorClasses: {},
    errors: {},
    volumeBuckets: {},
    firstSoundLatencyBuckets: {},
    lifecycle: {
      installCount: 0,
      updateCount: 0,
    },
    diagnostics: {
      optInCount: 0,
      optOutCount: 0,
      shareCount: 0,
      autoShareCount: 0,
      shareFailureCount: 0,
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
    statusErrorClasses: getObjectValue(safeBucket.statusErrorClasses),
    errors: getObjectValue(safeBucket.errors),
    volumeBuckets: getObjectValue(safeBucket.volumeBuckets),
    firstSoundLatencyBuckets: getObjectValue(safeBucket.firstSoundLatencyBuckets),
    lifecycle: {
      ...emptyBucket.lifecycle,
      ...getObjectValue(safeBucket.lifecycle),
    },
    diagnostics: {
      ...emptyBucket.diagnostics,
      ...getObjectValue(safeBucket.diagnostics),
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
  const key = toAnalyticsDimension(profileId);
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

function getAnalyticsProxyUrl() {
  const proxyEndpoint = ANALYTICS_CONFIG.proxyEndpoint.replace(/\/+$/, '');
  return proxyEndpoint.endsWith('/ga4') ? proxyEndpoint : `${proxyEndpoint}/ga4`;
}

function buildAnalyticsEventsForDate(dateKey, bucket) {
  const events = [];
  const normalizedBucket = normalizeDailyBucket(bucket);
  const baseParams = {
    event_date: toAnalyticsDimension(dateKey),
    engagement_time_msec: 100,
    session_id: Number(dateKey.replace(/-/g, '')) || 0,
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
        popup_open_count: toAnalyticsMetric(normalizedBucket.popup.openCount),
        profile_select_count: toAnalyticsMetric(normalizedBucket.popup.profileSelectCount),
        preview_play_count: toAnalyticsMetric(normalizedBucket.popup.previewPlayCount),
        mute_toggle_count: toAnalyticsMetric(normalizedBucket.popup.muteToggleCount),
        diagnostic_copy_count: toAnalyticsMetric(normalizedBucket.popup.diagnosticCopyCount),
        volume_change_count: toAnalyticsMetric(normalizedBucket.popup.volumeChangeCount),
      },
    });
  }

  if (normalizedBucket.lifecycle.installCount || normalizedBucket.lifecycle.updateCount) {
    events.push({
      name: 'daily_extension_lifecycle',
      params: {
        ...baseParams,
        install_count: toAnalyticsMetric(normalizedBucket.lifecycle.installCount),
        update_count: toAnalyticsMetric(normalizedBucket.lifecycle.updateCount),
      },
    });
  }

  if (
    normalizedBucket.diagnostics.optInCount ||
    normalizedBucket.diagnostics.optOutCount ||
    normalizedBucket.diagnostics.shareCount ||
    normalizedBucket.diagnostics.autoShareCount ||
    normalizedBucket.diagnostics.shareFailureCount
  ) {
    events.push({
      name: 'daily_diagnostics_usage',
      params: {
        ...baseParams,
        opt_in_count: toAnalyticsMetric(normalizedBucket.diagnostics.optInCount),
        opt_out_count: toAnalyticsMetric(normalizedBucket.diagnostics.optOutCount),
        share_count: toAnalyticsMetric(normalizedBucket.diagnostics.shareCount),
        auto_share_count: toAnalyticsMetric(normalizedBucket.diagnostics.autoShareCount),
        share_failure_count: toAnalyticsMetric(normalizedBucket.diagnostics.shareFailureCount),
      },
    });
  }

  for (const [profileId, profileStats] of Object.entries(normalizedBucket.profiles)) {
    events.push({
      name: 'daily_profile_usage',
      params: {
        ...baseParams,
        profile_id: toAnalyticsDimension(profileId),
        selected_count: toAnalyticsMetric(profileStats.selectedCount),
        previewed_count: toAnalyticsMetric(profileStats.previewedCount),
        key_event_count: toAnalyticsMetric(profileStats.keyEventCount),
        played_sound_count: toAnalyticsMetric(profileStats.playedSoundCount),
        dropped_sound_count: toAnalyticsMetric(profileStats.droppedSoundCount),
        first_sound_success_count: toAnalyticsMetric(profileStats.firstSoundSuccessCount),
      },
    });
  }

  for (const [statusState, count] of Object.entries(normalizedBucket.statuses)) {
    events.push({
      name: 'daily_status_result',
      params: {
        ...baseParams,
        status_state: toAnalyticsDimension(statusState),
        status_count: toAnalyticsMetric(count),
      },
    });
  }

  for (const [statusReason, count] of Object.entries(normalizedBucket.statusReasons)) {
    events.push({
      name: 'daily_status_reason',
      params: {
        ...baseParams,
        status_reason: toAnalyticsDimension(statusReason, 'none'),
        reason_count: toAnalyticsMetric(count),
      },
    });
  }

  for (const [captureMode, count] of Object.entries(normalizedBucket.captureModes)) {
    events.push({
      name: 'daily_capture_mode',
      params: {
        ...baseParams,
        capture_mode: toAnalyticsDimension(captureMode),
        mode_count: toAnalyticsMetric(count),
      },
    });
  }

  for (const [compatibilityMode, count] of Object.entries(normalizedBucket.compatibilityModes)) {
    events.push({
      name: 'daily_compatibility_mode',
      params: {
        ...baseParams,
        compatibility_mode: toAnalyticsDimension(compatibilityMode),
        mode_count: toAnalyticsMetric(count),
      },
    });
  }

  for (const [statusErrorClass, count] of Object.entries(normalizedBucket.statusErrorClasses)) {
    events.push({
      name: 'daily_status_error_class',
      params: {
        ...baseParams,
        status_error_class: toAnalyticsDimension(statusErrorClass),
        status_error_observation_count: toAnalyticsMetric(count),
      },
    });
  }

  for (const [errorClass, count] of Object.entries(normalizedBucket.errors)) {
    events.push({
      name: 'daily_error_class',
      params: {
        ...baseParams,
        error_class: toAnalyticsDimension(errorClass),
        error_count: toAnalyticsMetric(count),
      },
    });
  }

  for (const [volumeBucket, count] of Object.entries(normalizedBucket.volumeBuckets)) {
    events.push({
      name: 'daily_volume_bucket',
      params: {
        ...baseParams,
        volume_bucket: toAnalyticsDimension(volumeBucket),
        volume_count: toAnalyticsMetric(count),
      },
    });
  }

  for (const [latencyBucket, count] of Object.entries(normalizedBucket.firstSoundLatencyBuckets)) {
    events.push({
      name: 'daily_first_sound_latency',
      params: {
        ...baseParams,
        latency_bucket: toAnalyticsDimension(latencyBucket),
        latency_count: toAnalyticsMetric(count),
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
  const endpoint = getAnalyticsProxyUrl();

  for (let index = 0; index < events.length; index += 25) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        events: events.slice(index, index + 25),
      }),
    });

    if (!response.ok) {
      throw new Error(`GA4 proxy failed: HTTP ${response.status}`);
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
    case 'diagnostics_opt_in_changed':
      if (params.enabled) {
        bucket.diagnostics.optInCount += 1;
      } else {
        bucket.diagnostics.optOutCount += 1;
      }
      break;
    case 'diagnostic_shared':
      bucket.diagnostics.shareCount += 1;
      if (params.automatic) {
        bucket.diagnostics.autoShareCount += 1;
      }
      break;
    case 'diagnostic_share_failed':
      bucket.diagnostics.shareFailureCount += 1;
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
      if (params.statusErrorClass) {
        incrementCounter(bucket.statusErrorClasses, params.statusErrorClass);
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

async function recordAnalyticsErrorDelta(errorDeltas = {}) {
  const aggregatedDeltas = aggregateRuntimeErrorDeltas(errorDeltas);
  if (Object.keys(aggregatedDeltas).length === 0) {
    return;
  }

  const { state, lastFlushDate } = await getAnalyticsState();
  const bucket = getDailyBucket(state);

  for (const [errorClass, count] of Object.entries(aggregatedDeltas)) {
    incrementCounter(bucket.errors, errorClass, count);
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
    profileBucket.keyEventCount += toAnalyticsMetric(delta.keyEventCount);
    profileBucket.playedSoundCount += toAnalyticsMetric(delta.playedSoundCount);
    profileBucket.droppedSoundCount += toAnalyticsMetric(delta.droppedSoundCount);
    profileBucket.firstSoundSuccessCount += toAnalyticsMetric(delta.firstSoundSuccessCount);
  }

  pruneOldBuckets(state);
  await setAnalyticsState(state, lastFlushDate);

  if (isAnalyticsConfigured() && lastFlushDate !== getLocalDateKey()) {
    await flushDueAnalyticsBuckets();
  }
}

async function uploadDiagnosticReport(report, options = {}) {
  if (!isDiagnosticUploadConfigured()) {
    throw new Error('Diagnostic upload endpoint is not configured');
  }

  const response = await fetch(DIAGNOSTICS_CONFIG.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'keyboard-asmr-extension',
      automatic: Boolean(options.automatic),
      sentAt: new Date().toISOString(),
      report,
    }),
  });

  if (!response.ok) {
    throw new Error(`Diagnostic upload failed: HTTP ${response.status}`);
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
    return;
  }

  if (message.type === MESSAGE_TYPES.ANALYTICS_ERROR_DELTA) {
    enqueueAnalyticsUpdate(() => recordAnalyticsErrorDelta(message.errorDeltas));
    sendResponse?.({ ok: true });
    return;
  }

  if (message.type === MESSAGE_TYPES.DIAGNOSTIC_REPORT_UPLOAD) {
    uploadDiagnosticReport(message.report, { automatic: message.automatic })
      .then(() => {
        sendResponse?.({ ok: true });
      })
      .catch(error => {
        console.warn('Keyboard ASMR: diagnostic upload failed', error);
        sendResponse?.({
          ok: false,
          error: error.message || 'diagnostic_upload_failed',
        });
      });
    return true;
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
