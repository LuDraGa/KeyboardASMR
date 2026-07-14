import { describe, expect, it } from 'vitest';

import {
  createPlaybackMapping,
  loadPlaybackMappings,
  resolvePlaybackMapping,
} from '../../src/shared/playbackMapping';

describe('playback mapping resolution', () => {
  it('classifies an explicitly disabled release mapping as intentional silence', () => {
    const profileMappings = {
      default: {
        keydown: createPlaybackMapping({ id: 'press' }),
        keyup: null,
      },
    };

    expect(resolvePlaybackMapping(profileMappings, ['default'], 'keyup')).toEqual({
      status: 'unmapped',
    });
  });

  it('keeps a declared mapping eligible when its audio buffer failed to load', () => {
    const profileMappings = {
      default: {
        keydown: createPlaybackMapping(null),
      },
    };

    expect(resolvePlaybackMapping(profileMappings, ['default'], 'keydown')).toEqual({
      status: 'mapped',
      buffer: null,
    });
  });

  it('preserves eligible mappings when every declared audio buffer fails to load', async () => {
    const profileMappings = await loadPlaybackMappings(
      {
        default: {
          keydown: 'assets/sounds/missing.wav',
          keyup: null,
        },
      },
      async () => null
    );

    expect(resolvePlaybackMapping(profileMappings, ['default'], 'keydown')).toEqual({
      status: 'mapped',
      buffer: null,
    });
    expect(resolvePlaybackMapping(profileMappings, ['default'], 'keyup')).toEqual({
      status: 'unmapped',
    });
  });
});
