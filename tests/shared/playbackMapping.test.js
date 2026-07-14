import { describe, expect, it } from 'vitest';

import {
  createPlaybackMapping,
  resolvePlaybackMapping,
  startLoadingPlaybackMappings,
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
    const { mappings, buffersReady } = startLoadingPlaybackMappings(
      {
        default: {
          keydown: 'assets/sounds/missing.wav',
          keyup: null,
        },
      },
      async () => null
    );
    await buffersReady;

    expect(resolvePlaybackMapping(mappings, ['default'], 'keydown')).toEqual({
      status: 'mapped',
      buffer: null,
    });
    expect(resolvePlaybackMapping(mappings, ['default'], 'keyup')).toEqual({
      status: 'unmapped',
    });
  });

  it('exposes mapping eligibility before the audio buffer finishes loading', async () => {
    let finishLoading;
    const pendingBuffer = new Promise(resolve => {
      finishLoading = resolve;
    });

    const { mappings, buffersReady } = startLoadingPlaybackMappings(
      {
        default: {
          keydown: 'assets/sounds/press.wav',
          keyup: null,
        },
      },
      async () => await pendingBuffer
    );

    expect(resolvePlaybackMapping(mappings, ['default'], 'keydown')).toEqual({
      status: 'mapped',
      buffer: null,
    });
    expect(resolvePlaybackMapping(mappings, ['default'], 'keyup')).toEqual({
      status: 'unmapped',
    });

    let buffersFinished = false;
    buffersReady.then(() => {
      buffersFinished = true;
    });
    await Promise.resolve();
    expect(buffersFinished).toBe(false);

    finishLoading({ id: 'press' });
    await buffersReady;
    expect(buffersFinished).toBe(true);

    expect(resolvePlaybackMapping(mappings, ['default'], 'keydown')).toEqual({
      status: 'mapped',
      buffer: { id: 'press' },
    });
  });
});
