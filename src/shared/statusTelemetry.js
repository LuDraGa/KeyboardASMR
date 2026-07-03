export const STATUS_ERROR_CLASSES = Object.freeze({
  CONTENT_SCRIPT: 'content_script',
  TAB_ACCESS: 'tab_access',
  AUDIO: 'audio',
  PROFILE: 'profile',
  ASSET: 'asset',
  PLAYBACK: 'playback',
  RUNTIME: 'runtime',
  STATUS: 'status',
});

const STATUS_REASON_ERROR_CLASS = Object.freeze({
  tabs_api_unavailable: STATUS_ERROR_CLASSES.TAB_ACCESS,
  active_tab_query_failed: STATUS_ERROR_CLASSES.TAB_ACCESS,
  active_tab_missing: STATUS_ERROR_CLASSES.TAB_ACCESS,
  content_script_unavailable: STATUS_ERROR_CLASSES.CONTENT_SCRIPT,
  no_status_response: STATUS_ERROR_CLASSES.CONTENT_SCRIPT,
  audio_initializing: STATUS_ERROR_CLASSES.AUDIO,
  profile_unavailable: STATUS_ERROR_CLASSES.PROFILE,
});

const RUNTIME_ERROR_CLASS_BY_CODE = Object.freeze({
  audio_init_failed: STATUS_ERROR_CLASSES.AUDIO,
  audio_resume_failed: STATUS_ERROR_CLASSES.AUDIO,
  sound_fetch_failed: STATUS_ERROR_CLASSES.ASSET,
  sound_decode_failed: STATUS_ERROR_CLASSES.ASSET,
  profile_load_failed: STATUS_ERROR_CLASSES.PROFILE,
  sound_play_failed: STATUS_ERROR_CLASSES.PLAYBACK,
});

export function getStatusErrorClass({ statusState, reason, report } = {}) {
  const normalizedReason = reason || 'none';

  if (STATUS_REASON_ERROR_CLASS[normalizedReason]) {
    return STATUS_REASON_ERROR_CLASS[normalizedReason];
  }

  if (statusState === 'disconnected') {
    return STATUS_ERROR_CLASSES.CONTENT_SCRIPT;
  }

  if (statusState === 'attention') {
    if (report && !report.selectedProfileLoaded && !report.activeProfileLoaded) {
      return STATUS_ERROR_CLASSES.PROFILE;
    }
    return STATUS_ERROR_CLASSES.STATUS;
  }

  return null;
}

export function getRuntimeErrorClass(errorCode) {
  return RUNTIME_ERROR_CLASS_BY_CODE[errorCode] || STATUS_ERROR_CLASSES.RUNTIME;
}

export function aggregateRuntimeErrorDeltas(errorDeltas = {}) {
  const aggregated = {};

  for (const [errorCode, amount] of Object.entries(errorDeltas || {})) {
    const count = Number(amount);
    if (!Number.isFinite(count) || count <= 0) continue;

    const errorClass = getRuntimeErrorClass(errorCode);
    aggregated[errorClass] = (aggregated[errorClass] || 0) + Math.floor(count);
  }

  return aggregated;
}
