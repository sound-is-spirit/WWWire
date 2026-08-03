# WireDrafter: implementation handoff

You are continuing work on a Chrome MV3 extension that is partly built. Read
this whole file before writing code. It records decisions that were expensive to
arrive at, several of which look wrong until you know why they are that way.

## The product

WireDrafter turns any website into an **editable lo-fi wireframe**. Two halves:

1. **Wireframe mode** (built). Strips colour and decoration, flattens media to
   grey plates, draws hand-drawn-looking outlines on structural elements, and
   greeks text into grey bars.
2. **Edit mode** (not built). Drag any element on the page to a new position and
   delete any element, with undo.

Repo: private, `sound-is-spirit/WireDrafter`. Current version `0.2.0`.

## Current state

| Area | Status |
| --- | --- |
| `manifest.json` | Done. MV3, `storage` + `activeTab` + `scripting`, no `<all_urls>`, no declared content script. |
| `background.js` | Done for one toggle. Per-tab state in `chrome.storage.session`, on-demand injection, per-tab icon, clears state on navigation. |
| `content/engine.js` | Done. Shadow-DOM traversal, stylesheet mirroring, MutationObserver, module registry, state machine. |
| `content/wireframe.js` | Done. Wireframe renderer plus greeked text. |
| `content/edit.js` | **Not written.** Your main task. |
| Popup | **Not written.** Your second task. |
| Export | **Not written.** Stretch goal. |

There is currently no UI for individual flags. A toolbar click sends
`{wireframe: true, greek: true}` and a second click sends all-false.

## Architecture

```
background.js          Service worker. Owns per-tab state, injects content
                       files on demand, pushes state, drives the icon.
content/engine.js      Generic plumbing. Knows nothing about any feature.
content/wireframe.js   Feature module.
content/edit.js        Feature module (you write this).
```

The worker injects `["content/engine.js", "content/wireframe.js", ...]` **in that
order**. Feature modules return immediately if `window.__WD` is absent, so the
engine must be first. Add `content/edit.js` to `CONTENT_FILES` in
`background.js`.

### The module contract

The engine deliberately knows nothing about its modules' flag names. A module
registers itself and the engine derives everything else:

```js
WD.register({
  name: "edit",
  flags: { edit: false },          // defaults, merged into the state shape
  active: (s) => s.edit,           // "am I on?" the engine asks, never stores
  css(state) { return "..."; },    // optional, concatenated while active
  mount(state) { },                // called on the off -> on edge
  update(state) { },               // called on every apply while active
  unmount() { }                    // called on the on -> off edge
});
```

**Do not add your flags to `engine.js`.** If you find yourself editing the engine
to teach it about edit mode, the design has been broken. That coupling was
removed deliberately; an earlier version hardcoded the state shape in three
places that drifted out of sync.

### Engine API available to modules

| Call | Purpose |
| --- | --- |
| `WD.queryAll(sel)` | Query across light DOM **and every shadow root**, open or closed. Never returns extension-owned nodes. Use this, not `document.querySelectorAll`. |
| `WD.roots()` | All roots (document + every shadow root), cached per apply. |
| `WD.claim(el)` | Mark a node you created as extension-owned. |
| `WD.isOwnNode(el)` | True for extension-owned nodes. **Edit mode must refuse to drag or delete these.** |
| `WD.onRescan(fn)` | Register a debounced callback fired on DOM churn and resize. |
| `WD.invalidate()` | Request a rescan. |
| `WD.state` | Current merged flag object. |

CSS returned by `css()` is injected into the light DOM **and mirrored into every
shadow root**. Because the same text has to work inside a shadow root, where
`html` is not reachable, **never scope a selector behind `html.something`**. The
presence of the rule is the on/off gate.

## Invariants: do not break these

These are load-bearing. Each one was a real bug.

1. **Never write `position: relative` to a bare `.wd-box` rule.** At (0,1,0)
   specificity and last in source order it beats page rules like
   `.card { position: absolute }` and silently reflows the layout. Only elements
   *measured* as `position: static` get the `.wd-rel` class.
2. **Never swap fonts to greek text.** No substitute font matches every glyph's
   advance width, so a font swap always reflows the page. Bars are painted as a
   background gradient, which touches no layout-affecting property. Shift is
   exactly zero and must stay that way.
3. **Any SVG used as a `border-image` needs explicit `width`/`height`.** A
   viewBox alone gives no intrinsic size, so `border-image-slice` has no
   coordinate space and Chrome resolves it against the border image area
   instead. This produced sawtooth edges, corner ticks and giant arcs depending
   on box size. It cost several rounds to find.
4. **Keep `border-image` edges straight between the slice boundaries.**
   `stretch` scales the middle slice non-uniformly, so a diagonal stroke fades
   out across a wide box. Hand-drawn character lives in the corner slices, which
   never stretch.
5. **Never apply an SVG filter per element.** One rasterised filter region per
   element stalls the compositor. `feTurbulence` + `feDisplacementMap` was
   evaluated and rejected for exactly this.
6. **Read phase then write phase.** The tagging pass in `wireframe.js` batches
   all `getBoundingClientRect` / `getComputedStyle` reads before any class
   write. Do not read a computed style inside a write loop: it forces a style
   recalc per element.
7. **Content scripts must not `sendResponse`.** The worker broadcasts to every
   frame at once and one `sendMessage` has a single response channel. If every
   frame answered, all but the first would race and log "channel closed".
8. **State is per tab, in `chrome.storage.session`**, never `storage.local`.
   Persisting "on" across a browser restart would relaunch into a state whose
   renderer no longer exists.
9. **Injection must stay idempotent.** The worker injects unconditionally on
   every toggle; each file guards with a `window.__WD*` flag.

## Task 1: `content/edit.js`

Drag and delete arbitrary page elements. Register as a module per the contract.

**Pointer handling**
- Use **Pointer Events with `setPointerCapture`**, not mouse events. Plain
  `mouseup` is lost when the cursor crosses an iframe boundary or leaves the
  window, and the element sticks to the cursor forever.
- Listen on `window` in the **capture phase**, non-passive, so host page
  handlers cannot swallow the events. Call `preventDefault()` and
  `stopPropagation()` on the way down to neutralise page behaviour (text
  selection, link navigation).
- Resolve the target with `event.composedPath()[0]`, not `event.target`, so
  shadow-DOM elements resolve to the real node.

**Movement**
- Move with `transform: translate3d(x, y, 0)`. Never `top`/`left`: box-model
  changes force layout on every frame.
- Parse any existing transform first with
  `getComputedStyle(el).transform` (`matrix(a,b,c,d,tx,ty)`), and add your delta
  to the existing `tx`/`ty`. Blindly overwriting will snap elements that the
  page had already transformed.
- Set `will-change: transform` on drag start and remove it on drag end.
- Throttle the move handler with `requestAnimationFrame`.
- Known unsolved constraint: a dragged element still clips inside an ancestor
  with `overflow: hidden`. Max `z-index` does not escape a clipping or stacking
  ancestor. Either accept the clipping or reparent into the top layer and accept
  that it detaches from flow. Pick one and document it.

**Hover and delete**
- Track the hovered element and mark it with a class using `outline`, never
  `border`. Outlines sit outside the box model, so nothing reflows as the
  cursor moves between elements.
- `Backspace` or `Delete` removes the hovered element. **Call
  `preventDefault()`**, or Backspace navigates back.
- `Escape` exits edit mode.
- Maintain an undo stack of `{node, parent, nextSibling}` and bind Cmd/Ctrl+Z.
  Restore with `parent.insertBefore(node, nextSibling)`. Also record moves as
  `{node, prevTransform}` so undo covers both.
- **Guards:** never target `<html>`, `<body>`, or anything where
  `WD.isOwnNode(el)` is true.

**Teardown.** `unmount()` must remove every listener, drop the hover class, and
clear the undo stack. Deletions and moves are intentionally *not* reverted on
unmount, since that is the point of the tool, but say so in the README.

## Task 2: the popup

`background.js` currently has no popup and toggles directly via
`chrome.action.onClicked`. With more than one flag, add `default_popup` to the
manifest's `action` and move toggling into the popup.

- Opening the popup grants `activeTab` for that tab, so injection still works.
- Adding `default_popup` **stops `chrome.action.onClicked` firing**. Move that
  logic or the toolbar click will do nothing.
- Popups are ephemeral: read state from the worker on open, never cache it.
- Checkboxes: Wireframe, Greek text, Edit mode, Crisp outlines. Get the active
  tab with `chrome.tabs.query({active: true, currentWindow: true})`, then message
  the worker to patch that tab's state.
- Keep the keyboard command (`toggle-draft`, Ctrl/Cmd+Shift+Y) working.

## Task 3 (stretch): export

PNG and SVG of the wireframed page. Note the current renderer restyles the live
DOM in place rather than drawing to a canvas, so export needs either
`html2canvas`-style rasterisation or an SVG reconstruction from the tagged
boxes. The tagging pass already knows every box rectangle; reusing that is
likely cheaper than rasterising.

## Testing

**Chrome 150 silently ignores `--load-extension`.** `--enable-unsafe-extension-debugging`
does not help. You cannot load the packed extension headlessly, so the existing
harness drives the content scripts directly over the Chrome DevTools Protocol
with the two `chrome.*` APIs stubbed:

```js
window.chrome = {
  runtime: { onMessage: { addListener: f => msgs.push(f) } },
  dom: { openOrClosedShadowRoot: el => roots.get(el) || null }
};
```

Then `eval` `engine.js` and the feature modules into a real page and fire the
state message. There is a 25-assertion suite covering nested closed shadow
roots, teardown, the specificity regression, and observer self-triggering. It
lived in the scratchpad rather than the repo; **please commit your version of
it under `test/`.**

Screenshot via `Page.captureScreenshot` for visual work. Tuning the renderer by
looking at screenshots of a realistic page beat guessing at thresholds every
time.

**What the harness cannot verify:** `activeTab` granting on real click,
`executeScript` with `allFrames`, `storage.session`, the per-tab icon, and the
navigation-clears-state listener. Those need a manual load-unpacked pass. Say
plainly which parts you verified by execution and which you did not.

## Tuning dials

If the wireframe looks too sparse or too busy on a given site, these constants at
the top of `content/wireframe.js` are the levers, not the algorithm:

`MIN_W` `MIN_H` `MIN_AREA` (size floors), `MAX_ASPECT` (rejects dividers and
rules), `SKETCH_MIN` (below this an element gets a crisp hairline instead of the
border-image, which degenerates at small sizes), `NEST_TOL` and
`NEST_AREA_RATIO` (duplicate-box suppression), `MAX_BOXES` (pathological-page
guard), and in `roughRectPath`, `j` (corner jitter) and `over` (corner
overshoot, the strongest hand-drawn tell).

## House style

- Match the existing comment density. Comments explain **why**, especially where
  the code looks wrong without the reason.
- No em dash characters anywhere in code, comments, docs or UI copy.
- Vanilla JS, no build step, no dependencies, no remote code. The extension
  makes zero network requests and that is a stated privacy guarantee in
  `PRIVACY.md`. Do not add a CDN script.
- Update `CHANGELOG.md` and the README roadmap as you land things.
