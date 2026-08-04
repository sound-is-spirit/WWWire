# Changelog

All notable changes to WireDrafter are documented here.

WireDrafter is a new product built on the engine of
[GreyOut](https://github.com/sound-is-spirit/GreyOut). Versioning restarts at
`0.1.0`; the GreyOut history (up to 2.2.0) lives in that repository.

## [0.3.2] Added elements: resize, contrast, handle visibility

### Fixed
- **Added elements could be moved but not resized.** They relied on the CSS
  `resize` property, whose gripper Chrome draws inside the padding box. The
  drag handler's guard tested the content box instead, which never matched, so
  `preventDefault()` ran on every corner press and killed the resize before it
  started. Replaced with an explicit gripper of our own, which also removes an
  OS-styled widget that did not belong in a black-and-white wireframe.
- **The delete button and gripper appeared only after the element was clicked.**
  `will-change: left, top` was set on pointerdown. Neither property is
  compositable, so the hint bought nothing and only promoted the element to a
  fresh layer at click time; that repaint was what made the corners show up.
  Removed.

### Changed
- **Added containers and text boxes are black and white**, matching the
  wireframe: white fill, black border, black corner handles. They were a grey
  wash with a red delete button.
- Move and resize now share one pointer-drag helper (pointer capture, one write
  per frame, listeners scoped to the gesture, survives `pointercancel`).

## [0.3.1] Toolbar isolation and icon clutter

### Fixed
- **The toolbar's buttons rendered black on black on some sites.** The panel
  lives in the host page's DOM, so the page's own CSS could reach it. It is now
  behind a **closed shadow root**, which ends that in both directions
  structurally. Inline `!important` would only have restarted the arms race and
  loses to a host rule that also uses `!important`.
- **`WD.roots()` no longer descends into shadow roots the extension owns**, so
  the renderer's stylesheet is never mirrored inside the toolbar.

### Changed
- **Small media renders as a light icon rather than a dark plate.** An avatar or
  a nav glyph at the same 50% grey as a photograph turned dense pages into a
  field of identical dark squares. Media under `ICON_MAX` in either axis is
  lifted toward the paper and is no longer outlined.

## [0.3.0] Wireframe renderer and floating toolbar

### Added
- **Wireframe renderer.** Flattens the page to white surfaces and black type,
  strips decoration, collapses media to flat grey plates via `filter:
  contrast(0)`, and draws hand-drawn sketch outlines using a `border-image`
  built from an inline SVG rather than a per-element SVG filter.
- **Node-selection pass.** A batched measurement pass picks which elements are
  worth outlining, filtering by size floor, aspect ratio and duplicate-rectangle
  suppression so the result reads as a wireframe rather than a debug overlay.
- **Grey bars.** Text renders as bars sized and positioned to the measured text,
  painted as a background gradient locked to line-height. No font is swapped, so
  the page does not shift. Headings get a darker bar.
- **Floating toolbar.** Wireframe and Grey bars checkboxes, plus buttons to add
  draggable, natively resizable Containers and Text Boxes. Added elements delete
  with a red × and text boxes edit in place with native `contenteditable`.
- **Module architecture.** `content/engine.js` is generic plumbing (shadow
  traversal, stylesheet mirroring, observer, node ownership, module registry);
  `wireframe.js` and `toolbar.js` are feature modules that declare their own
  flags and lifecycle. The engine never learns a feature's vocabulary.

### Notes
- There is no popup. The toolbar icon and `Ctrl/Cmd+Shift+Y` toggle the tab
  directly; per-mode controls live in the in-page floating panel.
- Only elements you add can be moved or deleted. The extension does not edit the
  host page's own elements.

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
