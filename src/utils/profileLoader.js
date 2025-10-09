import yaml from 'js-yaml';

/**
 * Profile Loader - Handles loading and validation of YAML sound profiles
 * Supports multiple audio source types: bundled, url, storage
 */

class ProfileLoader {
  constructor() {
    this.loadedProfiles = new Map();
    this.audioCache = new Map();
  }

  /**
   * Load all bundled profiles from src/sound_profiles/
   */
  async loadBundledProfiles() {
    const profiles = [];

    // Define bundled profile files
    const bundledProfileFiles = [
      'typewriter.yaml',
      'soft.yaml',
      'medium.yaml',
      'hard.yaml',
      'drum.yaml',
      'pops.yaml',
      'alpaca.yaml',
      'apex-pro-tkl-v2.yaml',
      'banana-split.yaml',
      'gateron-black-ink.yaml',
      'gateron-red-ink.yaml',
      'holy-panda.yaml',
      'ios.yaml',
      'mx-black.yaml',
      'mx-blue.yaml',
      'mx-brown.yaml',
      'mx-speed-silver.yaml',
      'nk-cream.yaml',
      'opera-gx.yaml',
      'telios-v2.yaml',
      'new-typewriter.yaml',
    ];

    for (const filename of bundledProfileFiles) {
      try {
        const profile = await this.loadProfile(`sound_profiles/${filename}`);
        if (profile) {
          profiles.push(profile);
        }
      } catch (error) {
        console.warn(`Failed to load bundled profile ${filename}:`, error);
      }
    }

    return profiles;
  }

  /**
   * Load a single profile from a path
   */
  async loadProfile(profilePath) {
    try {
      const response = await fetch(chrome.runtime.getURL(profilePath));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const yamlText = await response.text();
      const profileData = yaml.load(yamlText);

      const validatedProfile = await this.validateProfile(profileData);
      this.loadedProfiles.set(validatedProfile.id, validatedProfile);

      return validatedProfile;
    } catch (error) {
      console.error(`Error loading profile from ${profilePath}:`, error);
      return null;
    }
  }

  /**
   * Validate profile structure and required fields
   */
  async validateProfile(profileData) {
    if (!profileData) {
      throw new Error('Profile data is empty');
    }

    // Required fields
    const requiredFields = ['name', 'audio_sources', 'key_mappings'];
    for (const field of requiredFields) {
      if (!profileData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Generate ID from name if not provided
    const id = profileData.id || this.generateIdFromName(profileData.name);

    // Default UI properties
    const ui = {
      icon: '🎹',
      color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      category: 'default',
      ...profileData.ui,
    };

    // Validate audio sources
    await this.validateAudioSources(profileData.audio_sources);

    // Validate key mappings reference valid audio sources
    this.validateKeyMappings(profileData.key_mappings, profileData.audio_sources);

    return {
      id,
      name: profileData.name,
      author: profileData.author || 'Unknown',
      description: profileData.description || '',
      version: profileData.version || '1.0',
      ui,
      audio_sources: profileData.audio_sources,
      key_mappings: profileData.key_mappings,
    };
  }

  /**
   * Validate that audio sources are accessible (new format only)
   */
  async validateAudioSources(audioSources) {
    for (const [sourceId, sourceConfig] of Object.entries(audioSources)) {
      if (!sourceConfig.type || !sourceConfig.path) {
        throw new Error(`Audio source "${sourceId}" missing type or path`);
      }

      // Validate based on type
      switch (sourceConfig.type) {
        case 'bundled':
          await this.validateBundledAudio(sourceConfig.path);
          break;
        case 'url':
          await this.validateUrlAudio(sourceConfig.path);
          break;
        case 'storage':
          // Will be validated at runtime when loading from storage
          break;
        default:
          throw new Error(`Unknown audio source type: ${sourceConfig.type}`);
      }
    }
  }

  /**
   * Validate bundled audio file exists
   */
  async validateBundledAudio(path) {
    try {
      const fullPath = `assets/sounds/${path}`;
      const response = await fetch(chrome.runtime.getURL(fullPath));
      if (!response.ok) {
        throw new Error(`Bundled audio not found: ${path}`);
      }
    } catch (error) {
      console.warn(`Could not validate bundled audio: ${path}`, error);
    }
  }

  /**
   * Validate URL audio is accessible (with basic check)
   */
  async validateUrlAudio(url) {
    try {
      // Basic URL format validation
      new URL(url);
      // Could add actual fetch validation here, but may be costly
    } catch (error) {
      throw new Error(`Invalid audio URL: ${url}`);
    }
  }

  /**
   * Validate key mappings reference valid audio sources (new format only)
   */
  validateKeyMappings(keyMappings, audioSources) {
    for (const [key, mapping] of Object.entries(keyMappings)) {
      if (typeof mapping !== 'object' || mapping === null) {
        throw new Error(`Invalid mapping format for key "${key}" - must be object with event types`);
      }

      // Validate each event type
      for (const [eventType, sourceId] of Object.entries(mapping)) {
        if (!['keydown', 'keyup', 'keypress'].includes(eventType)) {
          throw new Error(`Invalid event type "${eventType}" in mapping for key "${key}"`);
        }

        // Skip validation for null (explicitly disabled)
        if (sourceId === null) {
          continue;
        }

        if (!audioSources[sourceId]) {
          throw new Error(
            `Key mapping "${key}.${eventType}" references unknown audio source: ${sourceId}`
          );
        }
      }
    }

    if (!keyMappings.default) {
      throw new Error('Profile must define a "default" key mapping');
    }
  }

  /**
   * Generate profile ID from name
   */
  generateIdFromName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Resolve audio URL based on source configuration (new format only)
   */
  async resolveAudioUrl(sourceConfig) {
    switch (sourceConfig.type) {
      case 'bundled':
        return chrome.runtime.getURL(`assets/sounds/${sourceConfig.path}`);

      case 'url':
        return sourceConfig.path;

      case 'storage':
        // Load from chrome.storage - would return data URL or blob URL
        return await this.loadAudioFromStorage(sourceConfig.key);

      default:
        throw new Error(`Cannot resolve audio for type: ${sourceConfig.type}`);
    }
  }

  /**
   * Load audio data from Chrome storage (future feature)
   */
  async loadAudioFromStorage(storageKey) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([storageKey], result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        if (result[storageKey]) {
          // Assume stored as base64 data URL
          resolve(result[storageKey]);
        } else {
          reject(new Error(`Audio not found in storage: ${storageKey}`));
        }
      });
    });
  }

  /**
   * Get profile by ID
   */
  getProfile(profileId) {
    return this.loadedProfiles.get(profileId);
  }

  /**
   * Get all loaded profiles
   */
  getAllProfiles() {
    return Array.from(this.loadedProfiles.values());
  }

  /**
   * Convert chrome-extension:// URL to relative path
   */
  urlToRelativePath(audioUrl) {
    if (audioUrl.startsWith('chrome-extension://')) {
      const url = new URL(audioUrl);
      return url.pathname.replace('/', '');
    }
    return audioUrl;
  }

  /**
   * Convert profile to SOUND_SETS format with event types
   */
  async profileToLegacyFormat(profile) {
    const legacyFormat = {};

    for (const [key, mapping] of Object.entries(profile.key_mappings)) {
      legacyFormat[key] = {};

      for (const [eventType, sourceId] of Object.entries(mapping)) {
        if (sourceId === null) {
          legacyFormat[key][eventType] = null;
        } else {
          const sourceConfig = profile.audio_sources[sourceId];
          const audioUrl = await this.resolveAudioUrl(sourceConfig);
          legacyFormat[key][eventType] = this.urlToRelativePath(audioUrl);
        }
      }
    }

    return legacyFormat;
  }
}

// Export singleton instance
export const profileLoader = new ProfileLoader();
export default ProfileLoader;
