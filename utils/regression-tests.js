const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const failures = [];

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertIncludes(text, needle, message) {
  assert(text.includes(needle), message);
}

function assertRegex(text, regex, message) {
  assert(regex.test(text), message);
}

function assertOrder(text, first, second, message) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);

  assert(firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex, message);
}

function loadManifest() {
  try {
    return JSON.parse(readFile('src/manifest.json'));
  } catch (error) {
    fail(`src/manifest.json must parse as JSON: ${error.message}`);
    return {};
  }
}

function testGoogleDocsFrameInjection() {
  const manifest = loadManifest();
  const contentScript = manifest.content_scripts?.[0];

  assert(contentScript, 'manifest must define a content script entry');
  assert(
    contentScript?.matches?.includes('<all_urls>'),
    'content script must run on <all_urls>'
  );
  assert(contentScript?.all_frames === true, 'content script must run in all frames');
  assert(
    contentScript?.match_about_blank === true,
    'content script must match about:blank child frames'
  );
  assert(
    contentScript?.match_origin_as_fallback === true,
    'content script must match inherited-origin child frames'
  );
}

function testGoogleDocsKeyboardCapture() {
  const injectedScript = readFile('src/pages/Content/injected.js');

  assertIncludes(
    injectedScript,
    "hosts: ['docs.google.com']",
    'injected script must keep a Google Docs compatibility rule'
  );
  assertIncludes(
    injectedScript,
    '.docs-texteventtarget-iframe',
    'injected script must detect the Google Docs text-event iframe'
  );
  assertIncludes(
    injectedScript,
    "window.location.href === 'about:blank'",
    'injected script must accept Google Docs about:blank text-event frames'
  );
  assertIncludes(
    injectedScript,
    'document.referrer',
    'injected script must infer host context for inherited-origin frames'
  );
  assertIncludes(
    injectedScript,
    'isDocumentLevelTarget(event.target)',
    'injected script must accept document-level targets for Google Docs text events'
  );
  assertOrder(
    injectedScript,
    'const googleDocsTextEventContext = getGoogleDocsTextEventContext(event);',
    'const compatibilityTarget = getCompatibilityTarget(event);',
    'Google Docs text-event handling must run before generic compatibility matching'
  );
}

function testFallbackCapturePhase() {
  const contentScript = readFile('src/pages/Content/index.js');

  assertRegex(
    contentScript,
    /document\.addEventListener\('keydown', handleFallbackKeydown, true\)/,
    'fallback keydown listener must run in capture phase'
  );
  assertRegex(
    contentScript,
    /document\.addEventListener\('keyup', handleFallbackKeyup, true\)/,
    'fallback keyup listener must run in capture phase'
  );
}

testGoogleDocsFrameInjection();
testGoogleDocsKeyboardCapture();
testFallbackCapturePhase();

if (failures.length > 0) {
  console.error('Regression tests failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Regression tests passed.');
