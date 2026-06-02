const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const EVENT_TYPES = new Set(['keydown', 'keyup', 'keypress']);

function generateIdFromName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function pushError(errors, profileFile, message) {
  errors.push(`${profileFile}: ${message}`);
}

function validateAudioSource(errors, profileFile, sourceId, sourceConfig, soundsDir) {
  if (!sourceConfig || typeof sourceConfig !== 'object') {
    pushError(errors, profileFile, `audio source "${sourceId}" must be an object`);
    return;
  }

  if (!sourceConfig.type) {
    pushError(errors, profileFile, `audio source "${sourceId}" missing type`);
    return;
  }

  if (sourceConfig.type === 'bundled') {
    if (!sourceConfig.path) {
      pushError(errors, profileFile, `audio source "${sourceId}" missing path`);
      return;
    }

    const audioPath = path.join(soundsDir, sourceConfig.path);
    if (!fs.existsSync(audioPath) || !fs.statSync(audioPath).isFile()) {
      pushError(errors, profileFile, `missing bundled audio "${sourceConfig.path}"`);
    }
    return;
  }

  if (sourceConfig.type === 'url') {
    if (!sourceConfig.path) {
      pushError(errors, profileFile, `audio source "${sourceId}" missing path`);
      return;
    }

    try {
      new URL(sourceConfig.path);
    } catch (error) {
      pushError(errors, profileFile, `audio source "${sourceId}" has invalid URL`);
    }
    return;
  }

  if (sourceConfig.type === 'storage') {
    if (!sourceConfig.key) {
      pushError(errors, profileFile, `audio source "${sourceId}" missing storage key`);
    }
    return;
  }

  pushError(
    errors,
    profileFile,
    `audio source "${sourceId}" has unknown type "${sourceConfig.type}"`
  );
}

function validateProfileFile(profilePath, soundsDir) {
  const errors = [];
  const profileFile = path.basename(profilePath);
  let profile;

  try {
    profile = yaml.load(fs.readFileSync(profilePath, 'utf8'));
  } catch (error) {
    return {
      errors: [`${profileFile}: invalid YAML (${error.message})`],
      profileId: null,
    };
  }

  if (!profile || typeof profile !== 'object') {
    return {
      errors: [`${profileFile}: profile must be an object`],
      profileId: null,
    };
  }

  for (const field of ['name', 'audio_sources', 'key_mappings']) {
    if (!profile[field]) {
      pushError(errors, profileFile, `missing required field "${field}"`);
    }
  }

  if (!profile.audio_sources || typeof profile.audio_sources !== 'object') {
    pushError(errors, profileFile, 'audio_sources must be an object');
  } else {
    for (const [sourceId, sourceConfig] of Object.entries(profile.audio_sources)) {
      validateAudioSource(errors, profileFile, sourceId, sourceConfig, soundsDir);
    }
  }

  if (!profile.key_mappings || typeof profile.key_mappings !== 'object') {
    pushError(errors, profileFile, 'key_mappings must be an object');
  } else {
    if (!profile.key_mappings.default) {
      pushError(errors, profileFile, 'key_mappings must include "default"');
    }

    for (const [key, mapping] of Object.entries(profile.key_mappings)) {
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        pushError(errors, profileFile, `mapping for key "${key}" must be an object`);
        continue;
      }

      for (const [eventType, sourceId] of Object.entries(mapping)) {
        if (!EVENT_TYPES.has(eventType)) {
          pushError(errors, profileFile, `mapping "${key}.${eventType}" has invalid event type`);
          continue;
        }

        if (sourceId === null) {
          continue;
        }

        if (!profile.audio_sources || !profile.audio_sources[sourceId]) {
          pushError(
            errors,
            profileFile,
            `mapping "${key}.${eventType}" references unknown audio source "${sourceId}"`
          );
        }
      }
    }
  }

  return {
    errors,
    profileId: profile.name ? profile.id || generateIdFromName(profile.name) : null,
  };
}

function validateProfiles() {
  const rootDir = path.join(__dirname, '..');
  const profilesDir = path.join(rootDir, 'src', 'sound_profiles');
  const soundsDir = path.join(rootDir, 'src', 'assets', 'sounds');
  const profileFiles = fs
    .readdirSync(profilesDir)
    .filter(file => file.endsWith('.yaml'))
    .sort();

  const errors = [];
  const profileIds = new Map();

  for (const profileFile of profileFiles) {
    const { errors: fileErrors, profileId } = validateProfileFile(
      path.join(profilesDir, profileFile),
      soundsDir
    );
    errors.push(...fileErrors);

    if (profileId) {
      if (profileIds.has(profileId)) {
        errors.push(
          `${profileFile}: duplicate profile id "${profileId}" also used by ${profileIds.get(
            profileId
          )}`
        );
      } else {
        profileIds.set(profileId, profileFile);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Profile validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
  }

  console.log(`Validated ${profileFiles.length} sound profiles.`);
}

if (require.main === module) {
  validateProfiles();
}

module.exports = validateProfiles;
