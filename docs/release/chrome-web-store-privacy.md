# Chrome Web Store Privacy Disclosure

Use this checklist before shipping a release build with either `GA4_PROXY_ENDPOINT` or `DIAGNOSTIC_REPORT_ENDPOINT` configured.

## Current Data Position

Keyboard ASMR must disclose usage analytics and opt-in diagnostics if they are enabled in release builds.

Do not disclose collection of typed text, raw key values, raw URLs, browsing history, website content, personal communications, location, financial data, health data, authentication data, or payment data, because the extension must not collect those.

## Chrome Web Store Privacy Tab

In the Developer Dashboard, open the item and update Privacy practices before upload.

- Data collection: Yes, if analytics or diagnostic upload is enabled.
- Data use: Analytics and product support.
- Data sale: No.
- Data transfer for advertising: No.
- Human review of user data: No, except user-approved diagnostic support review if support handling requires it.
- Limited Use certification: Yes, certify that data is used only to provide or improve the extension and not for ads or unrelated purposes.

Recommended disclosed data categories:

- User activity: aggregate extension interactions, profile selection counts, popup/status events, daily per-profile key event counts, and support-report actions.
- Device or other IDs: anonymous analytics client id stored in `chrome.storage.local` when GA4 Measurement Protocol is configured.
- Diagnostics or device information: user agent, platform, language, extension version, audio/profile status, error codes, compatibility mode, and timing buckets when the user opts into diagnostic sharing.

Recommended non-collection notes:

- No typed text.
- No raw key values.
- No raw page URLs.
- No browsing history.
- No website content.
- No account, payment, location, health, or authentication data.

## Privacy Policy Draft

Use this as the starting copy for the privacy policy page linked from Chrome Web Store.

```text
Keyboard ASMR plays local keyboard sound effects in your browser.

The extension does not collect typed text, raw key values, passwords, form contents, website content, raw page URLs, browsing history, location, payment information, health information, authentication information, or personal communications.

If analytics is enabled, Keyboard ASMR collects privacy-safe aggregate usage data to understand reliability and product usage. This may include extension install/update events, popup opens, selected sound profile, profile preview/selection counts, daily per-profile key event counts, sound playback counts, error classes, compatibility modes, volume buckets, first-sound latency buckets, and diagnostic/report actions. Key event analytics are counts only; the extension does not send which keys were pressed or what was typed.

If diagnostic sharing is enabled, Keyboard ASMR can send a support report only after the user opts in or manually shares it from the popup. Diagnostic reports may include extension version, user agent, platform, language, selected sound profile, mute/volume settings, local audio/profile status, compatibility mode, error codes, timing buckets, and category-level key counters. Diagnostic reports exclude typed text, raw key values, raw URLs, browsing history, and website content.

Data is used only to improve Keyboard ASMR reliability, understand aggregate profile demand, and support users who report issues. Data is not sold and is not used for personalized, retargeted, or interest-based advertising.

Analytics data is processed by Google Analytics through the developer-controlled Cloudflare Worker proxy if configured. Diagnostic reports are sent only to the developer-controlled support endpoint if configured. All remote analytics and diagnostic endpoints must use HTTPS.

Users can disable diagnostic sharing from the extension popup. Removing the extension clears extension-local storage according to Chrome's extension storage behavior.
```

## Release Gate

Do not configure these env vars for a release build until the privacy tab and privacy policy are updated:

- `GA4_PROXY_ENDPOINT`
- `DIAGNOSTIC_REPORT_ENDPOINT`

Never configure `GA4_API_SECRET` in the extension release build. It belongs only in Cloudflare Worker Settings > Variables & Secrets.

Release build must pass:

- `npm run lint`
- `npm run build`
- Confirm `src/manifest.json` permissions are unchanged unless a separate review has approved them.

## Source Notes

- Chrome Web Store user data policy requires privacy disclosures for handled user data and secure transmission for personal or sensitive data: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Chrome extension GA4 integration uses Measurement Protocol from a Web data stream: https://developer.chrome.com/docs/extensions/how-to/integrate/google-analytics-4
