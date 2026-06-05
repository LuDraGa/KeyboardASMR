# Regression Testing

## Pre-build suite

Run the regression suite directly with:

```bash
npm run test:regression
```

`npm run build` also runs it automatically through the `prebuild` npm lifecycle hook. The suite uses Vitest with the verbose reporter so pre-build output shows named suites and individual passing or failing test cases.

Current pre-build suites:

- `tests/regression/googleDocsCapture.test.js` protects the Google Docs capture contract.
- `tests/regression/soundProfiles.test.js` validates bundled sound profiles and referenced audio files.
- `tests/shared/keyCategories.test.js` covers key categorization and playback fallback order.

## Google Docs silent typing bug

### Symptom

Typing in Google Docs produced no keyboard sound while normal inputs, textareas, and many other editors still worked.

### Root cause

Google Docs routes real typing through a text-event iframe. That frame can be `about:blank` or otherwise inherit its origin from the parent document, so the content script did not reliably inject there with only `all_frames: true`.

When the script did run, Docs could emit keyboard events with `body`, `html`, `document`, or `window` as the event target rather than a standard input-like element. The injected capture script rejected those targets, so no `KEYPRESS` message reached the content script and no sound played.

### Fix contract

The regression suite protects these source-level requirements:

- `src/manifest.json` must keep `all_frames`, `match_about_blank`, and `match_origin_as_fallback` enabled for the content script.
- `src/pages/Content/injected.js` must keep Google Docs compatibility logic for `.docs-texteventtarget-iframe` and `about:blank` text-event frames.
- The injected script must infer frame host context from current location, referrer, or accessible parents so inherited-origin Docs frames are still treated as Google Docs.
- Document-level event targets are accepted only through the Google Docs text-event frame path.
- `src/pages/Content/index.js` fallback listeners must run in capture phase.

### Manual release check

Before release, also verify the live editor because Google can change Docs internals without changing this repository:

1. Run `npm run build`.
2. Reload the unpacked extension from `chrome://extensions`.
3. Refresh an existing Google Docs tab or open a new document.
4. Type letters, space, enter, and backspace in the document body.
5. Confirm sounds play and the popup status shows captured key events.
