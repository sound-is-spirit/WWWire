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

## Security model — what this extension is (and is not)

Page GreyOut is a **visual privacy shield** for screen sharing. It re-renders
on-screen text as grey blocks via CSS. It is **not** a data-security control:

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
- **Minimal permissions.** `storage` only, plus `<all_urls>` host access needed to
  redact any page the user chooses to share. No `scripting`, `tabs`, `cookies`,
  or `webRequest`.
- **No cross-frame `postMessage`.** Every frame reads its own state from
  `chrome.storage`, so there is no message channel for a page to intercept.

## Scope

In scope: the extension source in this repository. Out of scope: the underlying
websites, Chrome itself, and the third-party Redacted font.
