import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readManifest() {
  return JSON.parse(readRepoFile('src/manifest.json'));
}

describe('Google Docs sound regression contract', () => {
  it('injects content scripts into inherited-origin frames', () => {
    const [contentScript] = readManifest().content_scripts;

    expect(contentScript.matches).toContain('<all_urls>');
    expect(contentScript.all_frames).toBe(true);
    expect(contentScript.match_about_blank).toBe(true);
    expect(contentScript.match_origin_as_fallback).toBe(true);
  });

  it('keeps the page-context injected script web accessible', () => {
    const resources = readManifest().web_accessible_resources.flatMap(entry => entry.resources);

    expect(resources).toContain('injected.bundle.js');
  });

  it('recognizes Google Docs text-event frames', () => {
    const injectedScript = readRepoFile('src/pages/Content/injected.js');

    expect(injectedScript).toContain("hosts: ['docs.google.com']");
    expect(injectedScript).toContain('.docs-texteventtarget-iframe');
    expect(injectedScript).toContain("window.location.href === 'about:blank'");
    expect(injectedScript).toContain('document.referrer');
  });

  it('accepts document-level targets only through the Google Docs path', () => {
    const injectedScript = readRepoFile('src/pages/Content/injected.js');
    const docsContextIndex = injectedScript.indexOf(
      'const googleDocsTextEventContext = getGoogleDocsTextEventContext(event);'
    );
    const genericContextIndex = injectedScript.indexOf(
      'const compatibilityTarget = getCompatibilityTarget(event);'
    );

    expect(injectedScript).toContain('function isDocumentLevelTarget(element)');
    expect(injectedScript).toContain('isDocumentLevelTarget(event.target)');
    expect(docsContextIndex).toBeGreaterThanOrEqual(0);
    expect(genericContextIndex).toBeGreaterThanOrEqual(0);
    expect(docsContextIndex).toBeLessThan(genericContextIndex);
  });

  it('uses capture-phase fallback listeners when injection is blocked', () => {
    const contentScript = readRepoFile('src/pages/Content/index.js');

    expect(contentScript).toMatch(
      /document\.addEventListener\('keydown', handleFallbackKeydown, true\)/
    );
    expect(contentScript).toMatch(
      /document\.addEventListener\('keyup', handleFallbackKeyup, true\)/
    );
  });
});
