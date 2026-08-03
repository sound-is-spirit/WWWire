// WireDrafter — wireframe renderer.
//
// Turns the page into a high-contrast lo-fi wireframe: flat white surfaces,
// black type, original decoration stripped, media collapsed to solid grey, and
// hand-drawn sketch outlines on structural elements.
//
// Two decisions carry most of the performance:
//
//   1. Media becomes flat grey with `filter: contrast(0)`. The contrast filter
//      is C' = (C - 0.5) * amount + 0.5, so at amount 0 every channel collapses
//      to exactly 0.5. One GPU-accelerated declaration turns any image, video or
//      canvas into a solid grey rectangle. No per-image work.
//
//   2. Sketch outlines are a `border-image` built from an inline SVG data URI,
//      NOT an feTurbulence/feDisplacementMap filter. A per-element SVG filter
//      means one rasterised filter region per element, which stalls the
//      compositor on any real page. A border-image is decoded once and reused
//      everywhere. Four seeded variants, cycled by index, keep it from looking
//      mechanically repeated.
//
// Greeked text draws bars as a repeating background gradient locked to each
// element's measured line-height. It deliberately does NOT swap the font: no
// substitute font can match every glyph's advance width, so a font swap always
// reflows the page slightly. Setting `color: transparent` and painting a
// background touches no layout-affecting property, so the shift is exactly zero.

(function () {
  "use strict";

  const WD = window.__WD;
  if (!WD || WD.wireframeLoaded) return;
  WD.wireframeLoaded = true;

  const BOX = "wd-box";
  const REL = "wd-rel";
  const TEXT = "wd-text";
  const THIN = "wd-thin";

  const INK = "#111111";
  const PAPER = "#ffffff";
  const GREY = "#c7c7c7";

  // --- Sketch border --------------------------------------------------------

  // Deterministic PRNG so a given variant always draws the same wobble.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A closed rectangle whose edge points are jittered off the true line, which
  // is what reads as "drawn by hand" rather than "drawn by a compositor".
  function roughRectPath(seed) {
    const r = rng(seed);
    const S = 90;
    const pad = 6;
    const j = 2.6;
    const per = 4; // points per side
    const pts = [];
    const push = (x, y) =>
      pts.push([
        +(x + (r() - 0.5) * j).toFixed(2),
        +(y + (r() - 0.5) * j).toFixed(2)
      ]);
    for (let i = 0; i < per; i++) push(pad + ((S - 2 * pad) * i) / per, pad);
    for (let i = 0; i < per; i++) push(S - pad, pad + ((S - 2 * pad) * i) / per);
    for (let i = 0; i < per; i++) push(S - pad - ((S - 2 * pad) * i) / per, S - pad);
    for (let i = 0; i < per; i++) push(pad, S - pad - ((S - 2 * pad) * i) / per);
    return "M" + pts.map((p) => p.join(",")).join("L") + "Z";
  }

  function sketchBorderImage(seed) {
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 90 90'>" +
      "<path d='" +
      roughRectPath(seed) +
      "' fill='none' stroke='" +
      INK +
      "' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg>";
    // encodeURIComponent turns the literal '#' in the colour into %23 for us.
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  const SEEDS = [11, 227, 4093, 65537];
  const VARIANT_CLASSES = SEEDS.map((_, i) => "wd-v" + i);

  // Built on first use, not at injection time: with allFrames a 30-iframe page
  // would otherwise pay for four SVG builds per frame, including in crisp mode
  // where the variants are never referenced.
  let variantRules = null;
  function sketchRules() {
    if (variantRules === null) {
      variantRules = SEEDS.map(
        (seed, i) =>
          `.${BOX}.${VARIANT_CLASSES[i]}::before { border-image-source: ${sketchBorderImage(seed)} !important; }`
      ).join("\n");
    }
    return variantRules;
  }

  // --- CSS ------------------------------------------------------------------
  //
  // Constant except for the `crisp` flag, so each variant is built at most once
  // rather than rebuilt on every state push.

  // Original borders are hidden rather than recoloured: the sketch outlines are
  // the only lines that should survive, and leaving the page's own borders in
  // black would double every edge.
  //
  // caret-color / ::placeholder / ::selection are universal on purpose. Scoping
  // them to the greeked-text class would miss <input placeholder>, which has no
  // child text node and so can never earn that class, leaking the placeholder.
  const BASE_CSS = `
* {
  background-color: ${PAPER} !important;
  background-image: none !important;
  color: ${INK} !important;
  -webkit-text-fill-color: ${INK} !important;
  border-color: transparent !important;
  box-shadow: none !important;
  text-shadow: none !important;
  border-radius: 0 !important;
  font-weight: 400 !important;
  letter-spacing: normal !important;
  caret-color: transparent !important;
}
html, body { background: ${PAPER} !important; }

/* Media collapses to a flat grey plate. contrast(0) maps every channel to
   0.5; alpha is untouched, so transparent icon padding stays transparent. */
img, video, canvas, svg, picture, iframe, object, embed {
  filter: grayscale(1) contrast(0) !important;
}
img, video, canvas, iframe, object, embed {
  background-color: ${GREY} !important;
  opacity: 1 !important;
}

input, select, textarea, button {
  background-color: ${PAPER} !important;
  color: ${INK} !important;
  -webkit-appearance: none !important;
  appearance: none !important;
}

/* Only elements measured as position:static get REL. Anything already
   positioned is a containing block already, so ::before anchors without us
   touching it. There is deliberately no bare \`.${BOX} { position: relative }\`:
   at (0,1,0) specificity and last in source order it would beat a page rule
   like \`.card { position: absolute }\` and silently reflow the layout. */
.${REL} { position: relative !important; }
`;

  const CRISP_CSS = `
.${BOX} { box-shadow: 0 0 0 1.5px ${INK} !important; }
`;

  const SKETCH_GEOMETRY = `
.${BOX}.${THIN} { box-shadow: 0 0 0 1px ${INK} !important; }
.${BOX}.${THIN}::before { content: none !important; }
.${BOX}::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  pointer-events: none !important;
  z-index: 2147483000;
  border: 5px solid transparent !important;
  border-image-slice: 30 !important;
  /* stretch, not round. Round tiles the middle slice along each edge, and a
     jittered path does not meet the slice boundary at a consistent offset, so
     every tile join leaves a gap and the outline renders as a dashed line. */
  border-image-repeat: stretch !important;
  border-image-width: 5px !important;
}
`;

  // Bars are painted as a background, so nothing that affects layout changes.
  // --wd-lh is the element's measured line-height, so bars sit on the real
  // lines instead of an assumed rhythm.
  const GREEK_CSS = `
.${TEXT} {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-decoration-color: transparent !important;
  background-image: linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--wd-lh, 1.2em) * 0.26),
    ${GREY} calc(var(--wd-lh, 1.2em) * 0.26),
    ${GREY} calc(var(--wd-lh, 1.2em) * 0.74),
    transparent calc(var(--wd-lh, 1.2em) * 0.74),
    transparent var(--wd-lh, 1.2em)
  ) !important;
  /* --wd-tw is the measured width of the element's actual text. For a
     single-line heading that is the word, not the column, which stops short
     headings rendering as full-width slabs. Multi-line text measures full
     width anyway, so it is unaffected. */
  background-size: var(--wd-tw, 100%) var(--wd-lh, 1.2em) !important;
  background-repeat: repeat-y !important;
  background-position: 0 0 !important;
  background-clip: content-box !important;
}
*::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }
*::selection { background: transparent !important; color: transparent !important; }
`;

  // --- Tagging pass ---------------------------------------------------------

  // Which elements are worth outlining. Boxing literally everything produces
  // debug-outline noise, not a wireframe, so this is a structural allowlist
  // filtered further by geometry below.
  const STRUCTURAL = new Set([
    "DIV", "SECTION", "HEADER", "NAV", "MAIN", "ASIDE", "ARTICLE", "FOOTER",
    "FORM", "FIELDSET", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH",
    "UL", "OL", "LI", "DL", "FIGURE", "BLOCKQUOTE", "PRE", "DETAILS",
    "IMG", "PICTURE", "VIDEO", "CANVAS", "IFRAME", "OBJECT", "EMBED",
    "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL"
  ]);
  const MEDIA_TAGS = new Set([
    "IMG", "PICTURE", "VIDEO", "CANVAS", "IFRAME", "OBJECT", "EMBED"
  ]);
  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "HEAD", "NOSCRIPT"]);

  const MIN_W = 40;
  const MIN_H = 24;
  const MIN_AREA = 2000;
  const MAX_BOXES = 1500; // guard against pathological pages

  // A rule, a divider or a 1px spacer is not structure. Anything this far from
  // square is a line pretending to be a box.
  const MAX_ASPECT = 25;

  // border-image lays four corner tiles of border-image-width before the middle
  // tile repeats. Below roughly 4x that width there is no middle left, so the
  // sketch stroke collapses into four corner ticks (and on short elements the
  // top and bottom strokes overlap into a scribble). Small boxes get the crisp
  // hairline instead: same information, no artefact.
  const SKETCH_MIN = 56;

  // A box within this many px of its nearest boxed ancestor on all four edges
  // is that ancestor drawn twice. Exact-rect keying missed these because real
  // wrappers differ by a pixel or two of padding.
  const NEST_TOL = 6;

  // A child filling this much of its nearest boxed ancestor is that ancestor
  // with padding, not a second structure worth outlining.
  const NEST_AREA_RATIO = 0.9;

  const ALL_CLASSES = [BOX, REL, TEXT, THIN, ...VARIANT_CLASSES];

  // The DOM is the source of truth for what we tagged, so there is no parallel
  // array to keep in sync and nothing pinning up to 1500 detached nodes alive
  // between passes.
  function clearTags() {
    for (const el of WD.queryAll("." + BOX + ", ." + TEXT)) {
      try {
        el.classList.remove(...ALL_CLASSES);
        el.style.removeProperty("--wd-lh");
        el.style.removeProperty("--wd-tw");
      } catch (e) {
        /* node gone */
      }
    }
  }

  function hasOwnText(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim().length > 1) return true;
    }
    return false;
  }

  function retag(state) {
    clearTags();
    if (!state.wireframe && !state.greek) return;

    // READ phase. Every measurement happens before any class write, so the
    // browser performs one layout instead of one per element. Nothing here
    // stores a live CSSStyleDeclaration: reading one back after a write in the
    // next phase would force a style recalc per element.
    const boxes = [];
    const texts = [];
    const seenRects = new Set();
    const keptRects = new Map();
    // One Range reused for every measurement rather than one per element.
    const textRange = document.createRange();

    // Nearest already-boxed ancestor's rect, crossing shadow boundaries via the
    // host. Walking up is O(depth), not another pass over the candidate list.
    function boxedAncestorRect(el) {
      let node = el;
      for (let hops = 0; hops < 14; hops++) {
        let parent = node.parentElement;
        if (!parent) {
          const root = node.getRootNode && node.getRootNode();
          parent = root && root.host ? root.host : null;
        }
        if (!parent) return null;
        const r = keptRects.get(parent);
        if (r) return r;
        node = parent;
      }
      return null;
    }

    for (const el of WD.queryAll("*")) {
      if (SKIP.has(el.tagName)) continue;

      const wantsBox = state.wireframe && STRUCTURAL.has(el.tagName);
      const wantsText = state.greek && hasOwnText(el);
      if (!wantsBox && !wantsText) continue;

      let rect;
      try {
        rect = el.getBoundingClientRect();
      } catch (e) {
        continue;
      }
      // Cheap geometry rejection first: a zero-size box also covers
      // display:none, so most candidates never reach getComputedStyle.
      const media = MEDIA_TAGS.has(el.tagName);
      const w = rect.width;
      const h = rect.height;
      const bigEnough = media
        ? w >= 8 && h >= 8
        : w >= MIN_W &&
          h >= MIN_H &&
          w * h >= MIN_AREA &&
          // Reject rules, dividers and spacer strips.
          w <= h * MAX_ASPECT &&
          h <= w * MAX_ASPECT;
      if (!wantsText && !bigEnough) continue;

      let cs;
      try {
        cs = getComputedStyle(el);
      } catch (e) {
        continue;
      }
      if (cs.visibility === "hidden") continue;

      if (wantsText) {
        const lh = parseFloat(cs.lineHeight);
        const fs = parseFloat(cs.fontSize) || 16;
        let tw = 0;
        try {
          textRange.selectNodeContents(el);
          tw = textRange.getBoundingClientRect().width;
        } catch (e) {
          /* fall back to full width */
        }
        texts.push({
          el,
          lh: isFinite(lh) && lh > 0 ? lh : fs * 1.2,
          // Only worth setting when the text is meaningfully narrower than its
          // box; otherwise leave the CSS default of 100%.
          tw: tw > 0 && tw < w - 2 ? tw : 0
        });
      }

      if (!wantsBox || !bigEnough) continue;
      // An inline box has no meaningful rectangle to outline.
      if (!media && cs.display === "inline") continue;

      // Two kinds of duplicate. Exact-rect keying catches unrelated elements
      // that happen to coincide; the ancestor walk catches the common case of a
      // wrapper chain whose links differ by a pixel or two of padding, which is
      // what produced the nested near-identical rectangles on real pages.
      const key =
        Math.round(rect.top) + "|" + Math.round(rect.left) + "|" +
        Math.round(w) + "|" + Math.round(h);
      if (seenRects.has(key)) continue;

      const near = boxedAncestorRect(el);
      if (near) {
        const tight =
          Math.abs(near.top - rect.top) <= NEST_TOL &&
          Math.abs(near.left - rect.left) <= NEST_TOL &&
          Math.abs(near.right - rect.right) <= NEST_TOL &&
          Math.abs(near.bottom - rect.bottom) <= NEST_TOL;
        // A fixed pixel tolerance cannot catch a padding-only wrapper: 16px of
        // padding is well past it, yet the two boxes are the same box to the
        // eye. Area ratio is scale-independent and does catch it.
        const nearArea = near.width * near.height;
        const filled = nearArea > 0 && (w * h) / nearArea > NEST_AREA_RATIO;
        if (tight || filled) continue;
      }

      seenRects.add(key);
      keptRects.set(el, rect);
      boxes.push({
        el,
        isStatic: cs.position === "static",
        // Below the sketch-viable size the border-image would render as four
        // corner ticks, so these get the crisp hairline instead.
        thin: w < SKETCH_MIN || h < SKETCH_MIN
      });
      if (boxes.length >= MAX_BOXES) break;
    }

    // WRITE phase. No reads, so no interleaved style recalc.
    boxes.forEach((b, i) => {
      b.el.classList.add(BOX, VARIANT_CLASSES[i % VARIANT_CLASSES.length]);
      if (b.isStatic) b.el.classList.add(REL);
      if (b.thin) b.el.classList.add(THIN);
    });

    for (const t of texts) {
      try {
        t.el.classList.add(TEXT);
        t.el.style.setProperty("--wd-lh", t.lh + "px");
        if (t.tw) t.el.style.setProperty("--wd-tw", t.tw + "px");
      } catch (e) {
        /* ignore */
      }
    }
  }

  WD.onRescan(() => retag(WD.state));

  WD.register({
    name: "wireframe",
    flags: { wireframe: false, greek: false, crisp: false },
    active: (s) => s.wireframe || s.greek,
    css(state) {
      let out = "";
      if (state.wireframe) {
        out += BASE_CSS + (state.crisp ? CRISP_CSS : SKETCH_GEOMETRY + sketchRules());
      }
      if (state.greek) out += GREEK_CSS;
      return out;
    },
    update(state) {
      retag(state);
    },
    unmount() {
      clearTags();
    }
  });
})();
