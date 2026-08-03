# WireDrafter

A Manifest V3 Chrome extension that turns any website into an **editable lo-fi
wireframe**. Strip the styling, sketch the structure, then move and delete
anything on the page.

> **Status: v0.1.0, early.** Only the text layer is implemented today (see
> [What works now](#what-works-now)). The structural and edit layers are
> designed but not built. WireDrafter grew out of
> [GreyOut](https://github.com/sound-is-spirit/GreyOut), a shipped
> screen-sharing redaction tool, and inherits its rendering engine.

## What works now

**Text as bars.** A single universal `*` rule re-renders every glyph on the page
in a solid-bar font, in flat grey. This is the text primitive of a lo-fi
wireframe: real copy becomes grey bars with the exact width and line-wrap of the
original, so **layout never shifts**. Icons and imagery stay visible.

It works everywhere, including single-page apps that constantly re-render and
text hidden inside encapsulated web-component **Shadow DOM** controls.

| Before | Text layer on |
|:---:|:---:|
| <img src="docs/example-normal.png" width="400"> | <img src="docs/example-redacted.png" width="400"> |

## Roadmap

The remaining layers, in build order. Design decisions behind these are recorded
in the notes referenced below.

1. **Structural layer.** Desaturate the page and draw the wireframe boxes into a
   **single full-viewport overlay canvas**, with hand-drawn-looking edges from
   seeded path jitter. Deliberately *not* per-element CSS borders or per-element
   SVG filters: thousands of filter regions stall the compositor, and a
   universal `position: relative` breaks real page layouts.
2. **Node-selection heuristic.** Deciding *which* elements get boxed is the real
   product problem. Boxing everything yields debug-outline noise, not a
   wireframe. Needs block-level plus area threshold plus occlusion tests, with
   landmark glyphs for images, video and form controls.
3. **Edit mode.** Drag and delete arbitrary nodes. Pointer Events with
   `setPointerCapture`, capture-phase listeners on `window`, `transform:
   translate3d` for movement, and an undo stack (`{node, parent, nextSibling}`
   plus Cmd+Z).
4. **Export.** PNG and SVG out of the overlay canvas.
5. **Permission and state rework.** Move from `<all_urls>` at `document_start`
   to `activeTab` + `scripting`, and from browser-wide `storage.local` to
   per-tab `storage.session`. Highest-value change on the list: it drops the
   broad install warning and fixes the "toggling affects every tab" problem in
   one move.

## How the current engine works

| Technique | What it does |
| --- | --- |
| **Universal `*` glyph substitution** | One unscoped rule re-renders every glyph as a solid bar. Nothing to enumerate, nothing missed; and because no `background` is set, bars can't stack into darker nested boxes. |
| **Embedded bar font (WOFF2, ~10 KB)** | Glyphs become bars that keep the exact width and line-wrap of the original text, so there is **zero layout shift**. A Base64 `data:` URI means no network request and no FOUC. |
| **`<style>` injection + Constructable Stylesheet** | The light DOM gets a reliable injected `<style>`; the same rules are also adopted into `document.adoptedStyleSheets`. Applying and removing is an O(1) CSSOM operation. |
| **`chrome.dom.openOrClosedShadowRoot()`** | Reaches text inside encapsulated **Shadow DOM** controls (even `mode:"closed"`) from the **ISOLATED world**, with no host-page code injection and no prototype patching. A `<style>` is injected into each shadow root. |

## Usage

- The toolbar icon is a **direct toggle** (no popup yet): click to turn ON,
  click again to turn OFF. The icon shows **ON** (green) / **OFF** (grey).
- Same toggle is bound to **Ctrl/Cmd+Shift+Y**.
- **Default is OFF.** Because it currently runs on every site, it stays off
  until you turn it on. The setting is global (applies to all tabs) and persists
  until you toggle it back. Both of those change in roadmap item 5.

## Architecture

```
background.js          Service worker. Persists {enabled} in storage,
                       handles the icon click, keyboard command, and the
                       ON/OFF icon. Touches no host-page code.

content_isolated.js    The whole engine. ISOLATED world only, all_frames +
                       about:blank, run_at document_start.
                       - Builds ONE stylesheet (embedded fonts + rules).
                       - Light DOM: injects it as <style> (+ adoptedStyleSheets).
                       - Shadow DOM: chrome.dom.openOrClosedShadowRoot() + a
                         <style> per shadow root.
                       - Reads the user toggle (storage.local).
```

Each frame reads its own state from `chrome.storage.local` and reacts to
`storage.onChanged`. There is no cross-frame `postMessage` and no cross-world
messaging to intercept.

## Privacy and data handling

- **No data collection.** The extension stores exactly one value,
  `enabled: true|false`, in `chrome.storage.local` on your own machine. Nothing
  else is read, stored, or transmitted.
- **No network requests.** No `fetch`/XHR/WebSocket/beacon. The bar font is
  embedded as a Base64 `data:` URI, so not even the font is downloaded.
- **No remote code.** All logic ships in the package (MV3 compliant).
- **No host-page tampering.** Runs only in the extension's ISOLATED world; it
  does not inject into the page's `MAIN` world or patch any native prototypes.
- **Permissions:** `storage` only, plus `<all_urls>` host access.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. **Load unpacked**, then select this folder.
4. Open any page and click the toolbar icon (or **Ctrl/Cmd+Shift+Y**).

## Customising

Everything is driven by `buildCss()` in `content_isolated.js`:

- **`ICON_KEEP`** lists selectors treated as icons/imagery, restored to an icon
  font so they render as icons rather than bars. Add one if a glyph icon turns
  into a bar; remove one if something you want barred is being spared.
- The grey tone is `#bcbcbc`; the bar fonts are the `Draft Bar` and
  `Draft Scribble` `@font-face` names.

## Scope and limitations

- **Visual only.** The real values remain in the DOM and page memory. DevTools,
  copy-paste and screen readers can still recover them. This is not a
  data-security control.
- **`<canvas>` / bitmap content is not reachable by CSS.** Text a page paints
  into a `<canvas>` cannot be turned into bars. SVG `<text>` is covered; canvas
  text is not.
- **Restricted pages.** Content scripts cannot run on `chrome://` pages, the
  Chrome Web Store, or other browsers' internal pages. That is a Chrome policy.

## Fonts

`Redacted` and `Redacted Script` by Christian Naths, released under the SIL Open
Font License, embedded as Base64 WOFF2 in `content_isolated.js` and re-exposed
under the `Draft Bar` and `Draft Scribble` family names.

## Licence

MIT. See [LICENSE](LICENSE).
