# Changelog

All notable changes to WireDrafter are documented here.

WireDrafter is a new product built on the engine of
[GreyOut](https://github.com/sound-is-spirit/GreyOut). Versioning restarts at
`0.1.0`; the GreyOut history (up to 2.2.0) lives in that repository.

## [0.1.0] Forked from GreyOut

### Changed
- **Renamed to WireDrafter** and reframed from a screen-sharing redaction tool
  to a lo-fi wireframing tool. Version reset to `0.1.0`.
- Font families renamed from `GreyOut Block` / `GreyOut Script` to
  **`Draft Bar`** / **`Draft Scribble`**. The underlying Redacted WOFF2 payloads
  are unchanged and deliberately retained: they are the wireframe text renderer,
  not dead weight.
- Internal identifiers renamed: `greyout-style` to `wiredrafter-style`,
  `data-greyout` to `data-wiredrafter`.
- Keyboard command renamed from `toggle-anonymizer` to `toggle-draft`. The
  default binding (`Ctrl/Cmd+Shift+Y`) is unchanged.

### Carried over from GreyOut 2.2.0
- Universal `*` glyph substitution renders all page text as grey bars with zero
  layout shift.
- Shadow DOM coverage (open and closed) via
  `chrome.dom.openOrClosedShadowRoot()`, from the ISOLATED world only. No
  MAIN-world injection, no prototype patching.
- Permissions: `storage` plus `<all_urls>` host access. No `scripting`, `tabs`,
  `cookies` or `webRequest`.
- No network requests, no remote code, no data collection.

### Not yet implemented
The structural wireframe layer, the node-selection heuristic, edit mode, export,
and the `activeTab` + per-tab-state rework. See the README roadmap.
