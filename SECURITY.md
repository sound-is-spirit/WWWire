# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately via GitHub's **[Security Advisories](../../security/advisories/new)**
("Report a vulnerability"), or email the maintainer. Include:

- A description of the issue and its impact.
- Steps to reproduce (a minimal page or repro is ideal).
- The Chrome version and extension version (`manifest.json` → `version`).

You can expect an acknowledgement within a few days. Please allow a reasonable
period for a fix before any public disclosure.

## Security model: what this extension is (and is not)

WireDrafter is a **visual rendering tool**. It re-renders a page as a lo-fi
wireframe via CSS, currently by turning on-screen text into grey bars. People do
use that as a screen-sharing privacy shield, so to be explicit: it is **not** a
data-security control.

- The real text still exists in the DOM and page memory. It can be recovered via
  DevTools, copy/paste, accessibility tools, or scripts running on the page.
- Do not rely on it to satisfy a policy that requires data not be *present*.

## Design choices that reduce risk

- **No network access.** No `fetch`/XHR/WebSocket/beacon; the font is an embedded
  Base64 `data:` URI. The extension makes zero external requests.
- **No remote code.** All logic ships in the package (MV3-compliant, default CSP).
- **No host-page tampering.** All logic runs in the extension's ISOLATED world.
  It does **not** inject into the page's MAIN world and does **not** patch native
  prototypes (e.g. `Element.prototype.attachShadow`). Shadow DOM is reached via
  the privileged `chrome.dom.openOrClosedShadowRoot()` API.
- **No standing host access.** Permissions are `storage`, `activeTab` and
  `scripting`. There is no `<all_urls>` host permission and no declared content
  script, so nothing runs on any site until the user invokes the extension on a
  specific tab, which is what grants `activeTab` for that tab alone. No `tabs`,
  `cookies` or `webRequest`.
- **No persisted state.** Per-tab flags live in `chrome.storage.session`, in
  memory, cleared when the browser closes and when a tab navigates or closes.
- **No cross-frame `postMessage`.** State reaches frames as a single
  `chrome.runtime` message from the service worker, so there is no page-visible
  message channel to intercept and no shared storage key another tab can read.

## Scope

In scope: the extension source in this repository. Out of scope: the underlying
websites, Chrome itself, and the third-party Redacted font.
