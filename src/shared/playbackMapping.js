export function createPlaybackMapping(buffer) {
  return { buffer };
}

export async function loadPlaybackMappings(keyMappings, loadBuffer) {
  const profileMappings = {};

  for (const [key, eventMappings] of Object.entries(keyMappings)) {
    profileMappings[key] = {};

    for (const eventType of ['keydown', 'keyup', 'keypress']) {
      const path = eventMappings[eventType];

      if (path === null) {
        profileMappings[key][eventType] = null;
      } else if (path) {
        profileMappings[key][eventType] = createPlaybackMapping(await loadBuffer(path));
      } else {
        profileMappings[key][eventType] = undefined;
      }
    }
  }

  return profileMappings;
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
