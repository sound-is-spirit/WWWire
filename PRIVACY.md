# Privacy Policy — Page GreyOut

_Last updated: 2026_

Page GreyOut does **not** collect, store, transmit, or sell any personal or
browsing data.

## What data the extension handles

- **Toggle state only.** A single value — whether redaction is on or off — is
  stored locally on your device via `chrome.storage.local`. It never leaves your
  machine.
- **Optional enterprise policy.** If your organization deploys a managed policy
  (`chrome.storage.managed`), the extension reads it locally to decide whether
  redaction is forced on for certain domains. This is read-only and set by your
  administrator; the extension does not send it anywhere.

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

For privacy questions, open a GitHub issue or contact the maintainer listed on
the repository.
