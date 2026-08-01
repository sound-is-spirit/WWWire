# Changelog

All notable changes to GreyOut are documented here.

## [2.2.0] — Renamed, enterprise policy removed

### Changed
- Renamed from **Page GreyOut** to **GreyOut**.

### Removed
- **Enterprise managed policy.** `chrome.storage.managed`, `schema.json` and the
  `ForceEnableOnDomains` handling are gone. The on/off state now comes solely
  from the user's own toggle, and the extension no longer reads
  `location.hostname`.

## [2.1.0] — Security hardening

### Changed
- **Removed all MAIN-world injection.** Shadow DOM is now reached from the
  ISOLATED world via `chrome.dom.openOrClosedShadowRoot()` instead of
  monkey-patching `Element.prototype.attachShadow`. This eliminates
  WAF/anti-bot fingerprinting, prototype-pollution, and DOM-event-spoofing risks.
- **Dropped the `scripting` permission** (no longer needed). Permissions are now
  `storage` + `<all_urls>` host access.
- **Removed cross-frame `postMessage`.** Each frame reads its own state from
  `chrome.storage`, so there is no wildcard message channel to intercept.

### Added
- Repository governance: `LICENSE` (MIT), `SECURITY.md`, `PRIVACY.md`.

## [2.0.0] — Universal engine

- Rewrote masking as **universal glyph substitution**: a single `*` rule renders
  every glyph in an embedded "Redacted" block font, in flat grey — no background
  boxes, so redacted regions never stack into darker nested boxes, and no element
  can be missed. Zero layout shift.
- Direct click-to-toggle toolbar icon with ON/OFF badge; `Ctrl/Cmd+Shift+Y`.
- Works on all sites (`<all_urls>`), default OFF.
