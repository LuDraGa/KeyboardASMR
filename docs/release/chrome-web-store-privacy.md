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

- User activity: aggregate extension interactions, profile selection counts, popup/status events, daily per-profile playback outcome and key event counts, exact volume settings/selections, mute-state changes, and support-report actions.

Recommended non-collection notes:

- No typed text.
- No raw key values.
- No raw page URLs.
- No browsing history.
- No website content.
- No account, payment, location, health, or authentication data.

## Exact Dashboard Copy

`docs/release/chrome-web-store-listing.yaml` is the single source of truth for every dashboard field (product details, graphics, privacy practices, distribution). Any change to live dashboard text must be mirrored there.

The privacy-practices subset that must match exactly:

- Single purpose description → `privacy.single_purpose_description`
- Storage permission justification → `privacy.permissions.storage.justification`
- Host permissions justification → `privacy.permissions.host_permissions.justification`
- Remote code selection → `privacy.remote_code.selected_option`
- Data usage checkboxes → `privacy.data_usage.planned_user_data_collection`
- Certifications → `privacy.certifications`

## Privacy Policy Phrase Guard

The hosted policy at `docs/release/privacy-policy.md` must contain each of these phrases verbatim. Removing any of them is a release blocker.

- "Keyboard ASMR does not collect typed text, raw key values, passwords, form contents, website content, raw page URLs, browsing history, location, payment information, health information, authentication information, or personal communications."
- "Key event analytics are counts only. Keyboard ASMR does not send which keys were pressed or what was typed."
- "Diagnostic reports exclude typed text, raw key values, raw page URLs, browsing history, and website content."
- "Keyboard ASMR does not sell user data."
- "The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements."
- "Keyboard ASMR's use and transfer of user data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements."

## Privacy Policy

Use `docs/release/privacy-policy.md` as the hosted privacy policy source.

Public Gist: https://gist.github.com/LuDraGa/c009fdd373468d5fb5e08a18b821d45f
Gist ID: `c009fdd373468d5fb5e08a18b821d45f`

The GitHub Actions workflow `.github/workflows/sync-privacy-policy-gist.yml` syncs that file to the Gist on pushes to `main` after these repository settings are configured:

- Repository variable: `PRIVACY_POLICY_GIST_ID` = `c009fdd373468d5fb5e08a18b821d45f`
- Repository secret: `PRIVACY_POLICY_GIST_TOKEN` = fine-grained or classic GitHub PAT with `gist` scope only
- Optional repository variable: `PRIVACY_POLICY_GIST_FILENAME` (defaults to `keyboard-asmr-privacy-policy.md`)

Paste the public Gist URL into the Chrome Web Store Privacy policy URL field.

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
