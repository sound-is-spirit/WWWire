# Page GreyOut

A Manifest V3 Chrome extension that masks **all visible text on any web page**
with clean grey "wireframe" blocks — safe for screen sharing, demos,
documentation and screenshots. It uses **universal glyph substitution** (every
character is re-rendered in a solid-block font), so nothing leaks and grey
regions never stack into darker nested boxes. Icons and imagery stay visible.

It works everywhere, and is hardened for the hardest cases — single-page apps
that constantly re-render, and text hidden inside encapsulated web-component
**Shadow DOM** controls.

## How it works

Four browser primitives, chosen to be fast and leak-free:

| Technique | What it does |
| --- | --- |
| **Universal `*` glyph substitution** | One unscoped rule re-renders every glyph as a solid block. Nothing to enumerate, nothing missed; and because no `background` is set, redacted regions can't stack into darker nested boxes. |
| **Embedded "Redacted" WOFF2 font** | Glyphs become blocks that keep the exact width & line-wrap of the original text → **zero layout shift**. Base64 `data:` URI = no network request, no FOUC. |
| **`<style>` injection + Constructable Stylesheet** | The light DOM gets a reliable injected `<style>`; the same rules are also adopted into `document.adoptedStyleSheets`. Applying/removing is an O(1) CSSOM operation. |
| **`chrome.dom.openOrClosedShadowRoot()`** | Reaches text inside encapsulated **Shadow DOM** / web-component controls (even `mode:"closed"`) from the **ISOLATED world** — no host-page code injection, no prototype patching. A `<style>` is injected into each shadow root. |

## Usage

- The toolbar icon is a **direct toggle** (no popup): click to turn ON, click to
  turn OFF. The badge shows **ON** (green) / **OFF** (grey).
- Same toggle is bound to **Ctrl/Cmd+Shift+Y**.
- **Default is OFF.** Because it runs on every site, it stays off until you turn
  it on for the page you're about to share. The setting is global (applies to
  all tabs) and persists until you toggle it back.

## Architecture

```
background.js          Service worker. Persists {enabled} in storage,
                       handles the icon click, keyboard command, and the
                       ON/OFF badge. Touches no host-page code.

content_isolated.js    The whole engine. ISOLATED world only, all_frames +
                       about:blank, run_at document_start.
                       - Builds ONE stylesheet (embedded fonts + rules).
                       - Light DOM: injects it as <style> (+ adoptedStyleSheets).
                       - Shadow DOM: chrome.dom.openOrClosedShadowRoot() + a
                         <style> per shadow root.
                       - Reads user toggle (storage.local) and optional
                         enterprise policy (storage.managed).

schema.json            Managed-policy schema for enterprise deployment.
```

Each frame reads its own state from `chrome.storage.local` and reacts to
`storage.onChanged` — there is no cross-frame `postMessage` and no cross-world
messaging to intercept.

## Privacy & data handling

- **No data collection.** The extension stores exactly one value —
  `enabled: true|false` — in `chrome.storage.local` on your own machine. Nothing
  else is read, stored, or transmitted.
- **No network requests.** No `fetch`/XHR/WebSocket/beacon; the redaction font
  is embedded as a Base64 `data:` URI, so not even the font is downloaded.
- **No remote code.** All logic ships in the package (MV3 compliant).
- **No host-page tampering.** Runs only in the extension's ISOLATED world; it
  does not inject into the page's `MAIN` world or patch any native prototypes.
- **Permissions:** `storage` only, plus `<all_urls>` host access (required to
  redact any page you choose to share).

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. **Load unpacked** → select this folder.
4. Open any page, click the toolbar icon (or **Ctrl/Cmd+Shift+Y**) to redact it;
   click again to reveal.

## Customising

Everything is driven by `buildCss()` in `content_isolated.js`:

- **`ICON_KEEP`** — selectors treated as icons/imagery (restored to an icon font
  so they render as icons, not blocks). Add one if a glyph icon turns into a
  block; remove one if something you want masked is being spared.
- Grey tone / block font are the `#bcbcbc` colour and the `@font-face` names.

## Scope & limitations (important)

- **Visual only.** The real values remain in the DOM/page memory. DevTools,
  copy-paste and screen readers can still recover them. Use this for
  *screen-sharing privacy*, not as a data-security control.
- **`<canvas>` / bitmap content isn't maskable by CSS.** Text a page paints into
  a `<canvas>` (some charts/visualisations) cannot be turned into blocks. SVG
  `<text>` is covered; canvas text is not.
- **Restricted pages.** Content scripts can't run on `chrome://` pages, the
  Chrome Web Store, or other browsers' internal pages (a Chrome policy).

## Fonts

`Redacted` and `Redacted Script` by Christian Naths, released under the SIL Open
Font License. Embedded as Base64 WOFF2 in `content_isolated.js`.
