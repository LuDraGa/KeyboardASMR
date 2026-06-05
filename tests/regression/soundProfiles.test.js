import { createRequire } from 'module';

import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const validateProfiles = require('../../utils/validate-profiles');

describe('sound profile registry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates all bundled sound profiles and referenced files', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => validateProfiles()).not.toThrow();
  });
});
