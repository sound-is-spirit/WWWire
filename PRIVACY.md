# Privacy Policy — GreyOut

_Last updated: 31 July 2026_

GreyOut does **not** collect, store, transmit, or sell any personal or
browsing data.

## What data the extension handles

- **Toggle state only.** A single value — whether redaction is on or off — is
  stored locally on your device via `chrome.storage.local`. It never leaves your
  machine.
That single value is the only thing the extension stores, anywhere.

## What the extension does NOT do

- No network requests of any kind (no analytics, telemetry, or tracking).
- No collection of page content, form data, URLs, or browsing history.
- No cookies, no fingerprinting, no remote code.

## Permissions

- `storage` — remember the on/off toggle.
- `<all_urls>` host access — required to apply the visual redaction to whichever
  page you choose to share. Page content is only read/modified locally in your
  browser to render the grey overlay; nothing is captured or sent.

## Contact

For privacy questions, open an issue at
https://github.com/sound-is-spirit/GreyOut/issues.
