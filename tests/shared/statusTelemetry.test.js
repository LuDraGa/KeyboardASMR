import { describe, expect, it } from 'vitest';

import {
  aggregateRuntimeErrorDeltas,
  getRuntimeErrorClass,
  getStatusErrorClass,
} from '../../src/shared/statusTelemetry';

describe('status telemetry classification', () => {
  it.each([
    ['tabs_api_unavailable', 'tab_access'],
    ['active_tab_query_failed', 'tab_access'],
    ['active_tab_missing', 'tab_access'],
    ['content_script_unavailable', 'content_script'],
  ])('classifies disconnected reason %s', (reason, expectedClass) => {
    expect(getStatusErrorClass({ statusState: 'disconnected', reason })).toBe(expectedClass);
  });

  it('classifies profile attention without using stale runtime error codes', () => {
    expect(
      getStatusErrorClass({
        statusState: 'attention',
        reason: 'profile_unavailable',
        report: {
          selectedProfileLoaded: false,
          activeProfileLoaded: false,
          stats: { lastErrorCode: 'sound_fetch_failed' },
        },
      })
    ).toBe('profile');
  });

  it('does not assign a status error class to ready checks', () => {
    expect(getStatusErrorClass({ statusState: 'ready', reason: 'none' })).toBeNull();
  });
});

describe('runtime error telemetry classification', () => {
  it.each([
    ['audio_init_failed', 'audio'],
    ['audio_resume_failed', 'audio'],
    ['sound_fetch_failed', 'asset'],
    ['sound_decode_failed', 'asset'],
    ['profile_load_failed', 'profile'],
    ['sound_play_failed', 'playback'],
    ['unexpected_error', 'runtime'],
  ])('maps runtime code %s to %s', (code, expectedClass) => {
    expect(getRuntimeErrorClass(code)).toBe(expectedClass);
  });

  it('aggregates runtime error deltas by stable class', () => {
    expect(
      aggregateRuntimeErrorDeltas({
        sound_fetch_failed: 2,
        sound_decode_failed: 1,
        profile_load_failed: 3,
        unexpected_error: 4,
        ignored_zero: 0,
      })
    ).toEqual({
      asset: 3,
      profile: 3,
      runtime: 4,
    });
  });
});
