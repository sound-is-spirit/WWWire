# Privacy Policy: WireDrafter

_Last updated: 3 August 2026_

WireDrafter does **not** collect, store, transmit, or sell any personal or
browsing data.

## What data the extension handles

- **Toggle state only.** One boolean per tab you have drafted, held in
  `chrome.storage.session`. That is in-memory storage on your own device: it
  never leaves your machine, and it is discarded when Chrome closes. No tab
  URLs, titles or identities are recorded, only an internal tab number.

Those booleans are the only thing the extension stores, anywhere.

## What the extension does NOT do

- No network requests of any kind (no analytics, telemetry, or tracking).
- No collection of page content, form data, URLs, or browsing history.
- No cookies, no fingerprinting, no remote code.

## Permissions

- `storage`, to remember which tabs are currently drafted.
- `activeTab`, granted only at the moment you click the toolbar icon or press
  the shortcut, and only for that one tab. The extension has no standing access
  to any site, and requests no `<all_urls>` host permission.
- `scripting`, to inject the renderer into the tab you just invoked it on.

Page content is only read and restyled locally in your browser to draw the
wireframe. Nothing is captured or sent.

## Contact

For privacy questions, open an issue at
https://github.com/sound-is-spirit/WireDrafter/issues.
