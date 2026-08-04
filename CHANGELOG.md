# Changelog

All notable changes to WireDrafter are documented here.

WireDrafter is a new product built on the engine of
[GreyOut](https://github.com/sound-is-spirit/GreyOut). Versioning restarts at
`0.1.0`; the GreyOut history (up to 2.2.0) lives in that repository.

## [0.3.0] Wireframe, Edit Mode, and Popup

### Added
- **Structural layer:** Desaturate the page, flatten media to grey plates, and draw hand-drawn-looking outlines on structural elements.
- **Node-selection heuristic:** Intelligent filtering (block-level, area threshold, aspect ratio) prevents outline noise.
- **Edit mode:** Drag and drop elements anywhere on the page, delete arbitrary nodes, and undo (Cmd/Ctrl+Z) deletions and moves.
- **Popup UI:** Fine-grained toggle controls for Wireframe, Greek text, Crisp outlines, and Edit mode instead of a single toolbar toggle.

### Changed
- The toolbar icon click no longer toggles the extension on/off directly. Use the popup, or the `Ctrl/Cmd+Shift+Y` keyboard command.

## [0.2.0] Permission and state rework

Roadmap item 5. The extension no longer runs everywhere by default.

### Changed
- **Dropped `<all_urls>` host permission.** Permissions are now `storage`,
  `activeTab` and `scripting`. The install prompt no longer asks to read and
  change data on all websites.
- **The content script is no longer declared in the manifest.** It is injected
  on demand with `chrome.scripting.executeScript` (allFrames) into the one tab
  the user invoked the extension on. Nothing runs until asked.
- **State is per tab**, held by the service worker in `chrome.storage.session`
  keyed by tab id. Toggling a tab no longer flips every other tab and iframe.
  The old browser-wide `storage.local.enabled` key is deleted on update.
- **The content script holds no state of its own.** It starts inert and applies
  whatever the worker's last `wiredrafter:setState` message said, instead of
  reading storage and subscribing to `storage.onChanged`.
- **Injection is idempotent.** A re-injection guard means the worker can inject
  unconditionally on every toggle without tracking live frames.
- **The toolbar icon is per tab**: green while that tab is drafted, plain
  otherwise, so the icon reflects the tab rather than a global flag.

### Added
- Draft mode is cleared on navigation, reload and tab close, so the icon can no
  longer claim a tab is drafted after its renderer has died.
- A badge flash when Chrome forbids scripting the page (`chrome://`, the Web
  Store, other extensions' pages) instead of failing silently.

### Known limitation
A sub-frame that navigates on its own while draft mode is on is not re-drafted
until the next toggle.

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
