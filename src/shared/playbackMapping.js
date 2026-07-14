export function createPlaybackMapping(buffer = null) {
  return { buffer };
}

export function startLoadingPlaybackMappings(keyMappings, loadBuffer) {
  const profileMappings = {};
  const declaredMappings = [];

  for (const [key, eventMappings] of Object.entries(keyMappings)) {
    profileMappings[key] = {};

    for (const eventType of ['keydown', 'keyup', 'keypress']) {
      const path = eventMappings[eventType];

      if (path === null) {
        profileMappings[key][eventType] = null;
      } else if (path) {
        const mapping = createPlaybackMapping();
        profileMappings[key][eventType] = mapping;
        declaredMappings.push({ mapping, path });
      } else {
        profileMappings[key][eventType] = undefined;
      }
    }
  }

  const buffersReady = (async () => {
    for (const { mapping, path } of declaredMappings) {
      mapping.buffer = await loadBuffer(path);
    }

    return profileMappings;
  })();

  return { mappings: profileMappings, buffersReady };
}

export function resolvePlaybackMapping(profileMappings, candidates, eventType) {
  if (!profileMappings) {
    return { status: 'profile_unavailable' };
  }

  for (const candidate of candidates) {
    const mapping = profileMappings[candidate]?.[eventType];
    if (mapping === undefined) continue;

    if (mapping === null) {
      return { status: 'unmapped' };
    }

    return { status: 'mapped', buffer: mapping.buffer };
  }

  return { status: 'unmapped' };
}
