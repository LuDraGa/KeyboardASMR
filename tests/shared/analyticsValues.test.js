import { describe, expect, it } from 'vitest';

import {
  getMuteState,
  normalizeVolumePercent,
  selectLatestActiveVolume,
} from '../../src/shared/analyticsValues';

describe('analytics values', () => {
  it('preserves an exact volume percentage instead of assigning a bucket', () => {
    expect(normalizeVolumePercent(42)).toBe(42);
  });

  it('keeps zero volume distinct from the mute state', () => {
    expect(normalizeVolumePercent(0)).toBe(0);
    expect(normalizeVolumePercent(null)).toBeNull();
    expect(getMuteState(true)).toBe('muted');
    expect(getMuteState(false)).toBe('unmuted');
  });

  it('does not let an older playback batch replace a newer active volume', () => {
    expect(
      selectLatestActiveVolume(
        { volumePercent: 80, usedAt: 200 },
        { volumePercent: 20, usedAt: 100 }
      )
    ).toEqual({ volumePercent: 80, usedAt: 200 });
  });
});
