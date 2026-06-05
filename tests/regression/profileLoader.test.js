import { afterEach, describe, expect, it, vi } from 'vitest';

import ProfileLoader from '../../src/utils/profileLoader';

const minimalProfileYaml = `
name: "Minimal Profile"
author: "Keyboard ASMR"
description: "Profile loader regression fixture"
version: "1.0"

audio_sources:
  key:
    type: "bundled"
    path: "keyboard/soft.wav"

key_mappings:
  default:
    keydown: "key"
`;

describe('profile loader bundled resource resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads webpack-embedded bundled profiles without fetching extension resources', async () => {
    const fetchMock = vi.fn();
    const bundledProfileSources = vi.fn(filename => {
      expect(filename).toBe('./banana-split.yaml');
      return minimalProfileYaml;
    });
    const loader = new ProfileLoader({ bundledProfileSources });

    vi.stubGlobal('fetch', fetchMock);

    const profile = await loader.loadBundledProfileById('banana-split');

    expect(profile).toMatchObject({
      id: 'minimal_profile',
      name: 'Minimal Profile',
    });
    expect(bundledProfileSources).toHaveBeenCalledWith('./banana-split.yaml');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to chrome extension URLs when no embedded source is available', async () => {
    const getURL = vi.fn(path => `chrome-extension://keyboard-asmr/${path}`);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => minimalProfileYaml,
    }));
    const loader = new ProfileLoader({ bundledProfileSources: null });

    vi.stubGlobal('chrome', { runtime: { getURL } });
    vi.stubGlobal('fetch', fetchMock);

    const profile = await loader.loadBundledProfileById('banana-split');

    expect(profile).toMatchObject({
      id: 'minimal_profile',
      name: 'Minimal Profile',
    });
    expect(getURL).toHaveBeenCalledWith('sound_profiles/banana-split.yaml');
    expect(fetchMock).toHaveBeenCalledWith(
      'chrome-extension://keyboard-asmr/sound_profiles/banana-split.yaml'
    );
  });
});
