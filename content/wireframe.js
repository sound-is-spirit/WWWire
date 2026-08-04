// WWWire - wireframe renderer.
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

  const NOT_OWN = WD.NOT_OWN;

  const BOX = "wd-box";
  const REL = "wd-rel";
  const TEXT = "wd-text";
  const THIN = "wd-thin";
  const HEAD = "wd-head";
  const ICON = "wd-icon";

  const INK = "#111111";
  const PAPER = "#ffffff";
  const GREY = "#c9c9c9";
  const DARK = "#9a9a9a"; // heading bars, so hierarchy reads

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
  //
  // The path is pinned to the nominal line exactly at the 30 and 60 slice
  // boundaries. That is what lets border-image-repeat use `round`: each tile
  // starts and ends on the line, so the joins are invisible. `stretch` would
  // also avoid seams, but it stretches one wobble across the whole edge, so a
  // wide box comes out nearly straight and loses the hand-drawn feel. With
  // pinned boundaries the wobble keeps a constant wavelength at any width.
  function roughRectPath(seed) {
    const r = rng(seed);
    const A = 15; // rect inset inside the 90-unit source box
    const B = 75;
    const j = 3.5; // corner jitter, source units
    const over = 7; // overshoot past the corner: the strongest hand-drawn tell
    const jit = () => (r() - 0.5) * 2 * j;
    const f = (n) => +n.toFixed(2);

    // Each edge is dead straight between the slice boundaries at 30 and 60.
    // That matters because `stretch` scales the middle slice non-uniformly: a
    // diagonal stroke stretched across a wide box thins out and fades, while a
    // straight one keeps constant weight at any width. All the character lives
    // in the corner slices, which are never stretched.
    //
    // Drawn as four open strokes rather than one closed rectangle so the ends
    // overshoot and cross at the corners, the way a pen does.
    return [
      `M${f(A - over)},${f(A + jit())}L30,${A}L60,${A}L${f(B + over)},${f(A + jit())}`,
      `M${f(B + jit())},${f(A - over)}L${B},30L${B},60L${f(B + jit())},${f(B + over)}`,
      `M${f(B + over)},${f(B + jit())}L60,${B}L30,${B}L${f(A - over)},${f(B + jit())}`,
      `M${f(A + jit())},${f(B + over)}L${A},60L${A},30L${f(A + jit())},${f(A - over)}`
    ].join("");
  }

  function sketchBorderImage(seed) {
    const svg =
      // width/height are required, not decorative. An SVG with only a viewBox
      // has no intrinsic size, so `border-image-slice: 30` has no 90-unit
      // coordinate space to slice against and Chrome resolves it against the
      // border image area instead, which distorts the corners wildly.
      "<svg xmlns='http://www.w3.org/2000/svg' width='90' height='90' viewBox='0 0 90 90'>" +
      "<path d='" +
      roughRectPath(seed) +
      // stroke-width is in source units. The 30-unit slice renders at BAND px,
      // so the on-screen width is 30 / BAND times smaller than the number here.
      "' fill='none' stroke='" +
      INK +
      "' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/></svg>";
    // encodeURIComponent turns the literal '#' in the colour into %23 for us.
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  const SEEDS = [11, 227, 4093, 65537];
  const VARIANT_CLASSES = SEEDS.map((_, i) => "wd-v" + i);

  // Built on first use, not at injection time: with allFrames a 30-iframe page
  // would otherwise pay for four SVG builds per frame.
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
  // Constant, so it is built once rather than rebuilt on every state push.

  // Original borders are hidden rather than recoloured: the sketch outlines are
  // the only lines that should survive, and leaving the page's own borders in
  // black would double every edge.
  //
  // caret-color / ::placeholder / ::selection are universal on purpose. Scoping
  // them to the greeked-text class would miss <input placeholder>, which has no
  // child text node and so can never earn that class, leaking the placeholder.
  const BASE_CSS = `
*${NOT_OWN} {
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
img${NOT_OWN}, video${NOT_OWN}, canvas${NOT_OWN}, svg${NOT_OWN},
picture${NOT_OWN}, iframe${NOT_OWN}, object${NOT_OWN}, embed${NOT_OWN} {
  filter: grayscale(1) contrast(0) !important;
}
img${NOT_OWN}, video${NOT_OWN}, canvas${NOT_OWN},
iframe${NOT_OWN}, object${NOT_OWN}, embed${NOT_OWN} {
  background-color: ${GREY} !important;
  opacity: 1 !important;
}

/* An avatar or a nav icon is not content. Left at the same 50% grey as a real
   photograph, a page like a social feed turns into a field of identical dark
   squares. brightness() lifts them toward the paper so they read as marks
   rather than as blocks. */
/* The tag and NOT_OWN prefix are load-bearing, not decoration. The :not()
   pseudo-class takes the specificity of its most specific argument, so the
   generic media rule above scores (0,1,1) and would beat a bare .wd-icon
   class selector at (0,1,0). */
img${NOT_OWN}.${ICON}, video${NOT_OWN}.${ICON}, canvas${NOT_OWN}.${ICON},
svg${NOT_OWN}.${ICON}, picture${NOT_OWN}.${ICON}, iframe${NOT_OWN}.${ICON},
object${NOT_OWN}.${ICON}, embed${NOT_OWN}.${ICON} {
  filter: grayscale(1) contrast(0) brightness(1.5) !important;
  background-color: transparent !important;
}

input${NOT_OWN}, select${NOT_OWN}, textarea${NOT_OWN}, button${NOT_OWN} {
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

  const SKETCH_GEOMETRY = `
.${BOX}.${THIN} { box-shadow: 0 0 0 1px ${INK} !important; }
.${BOX}.${THIN}::before { content: none !important; }
.${BOX}::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  pointer-events: none !important;
  z-index: 2147483000;
  /* stretch, not round. round ties the repeat tile to border-image-width, so
     the wobble repeats every few px and reads as a sawtooth, and the corner
     slices break long edges into ticks. stretch draws each edge once: the
     wobble becomes a single gentle wave along the edge, which is what a
     hand-drawn box actually looks like.
     The band is 8px rather than the ~1.6px the line needs, because the SVG is
     scaled by band/slice; the stroke is sized in source units to compensate.
     The ::before is inset:0 over the parent, so this border sits inside the
     pseudo-element and changes no page layout. */
  border: 8px solid transparent !important;
  border-image-slice: 30 !important;
  border-image-repeat: stretch !important;
  border-image-width: 8px !important;
}
`;

  // Bars are painted as a background, so nothing that affects layout changes.
  // --wd-lh is the element's measured line-height, so bars sit on the real
  // lines instead of an assumed rhythm.
  const GREEK_CSS = `
.${TEXT} {
  /* Bar thickness tracks line-height but is capped: a 64px display heading
     scaled proportionally renders as a 30px slab, which reads as a filled
     block rather than as text. Clamped and centred in the line box instead,
     so a big heading gets a longer bar, not a fatter one. */
  --wd-bar: clamp(4px, calc(var(--wd-lh, 1.2em) * 0.42), 15px);
  --wd-c: ${GREY};
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-decoration-color: transparent !important;
  background-image: linear-gradient(
    to bottom,
    transparent 0,
    transparent calc((var(--wd-lh, 1.2em) - var(--wd-bar)) / 2),
    var(--wd-c) calc((var(--wd-lh, 1.2em) - var(--wd-bar)) / 2),
    var(--wd-c) calc((var(--wd-lh, 1.2em) + var(--wd-bar)) / 2),
    transparent calc((var(--wd-lh, 1.2em) + var(--wd-bar)) / 2),
    transparent var(--wd-lh, 1.2em)
  ) !important;
  /* --wd-tw is the measured width of the element's actual text. For a
     single-line heading that is the word, not the column, which stops short
     headings rendering as full-width slabs. Multi-line text measures full
     width anyway, so it is unaffected. */
  background-size: var(--wd-tw, 100%) var(--wd-lh, 1.2em) !important;
  background-repeat: repeat-y !important;
  /* --wd-tx is the measured horizontal offset of the text from the content-box
     edge, so a bar sits where its text sits. Anchoring at 0 would hard-left
     every bar and break centred and right-aligned text. Measuring rather than
     reading text-align also covers direction:rtl, margin:auto and flex/grid
     justification for free. */
  background-origin: content-box !important;
  background-position: var(--wd-tx, 0px) 0 !important;
  background-clip: content-box !important;
}
/* Headings keep their weight so the page still has hierarchy once greeked. */
.${TEXT}.${HEAD} { --wd-c: ${DARK}; }
*${NOT_OWN}::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }
*${NOT_OWN}::selection { background: transparent !important; color: transparent !important; }
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

  const MIN_W = 100;
  const MIN_H = 40;
  const MIN_AREA = 25000;
  const MAX_BOXES = 1500; // guard against pathological pages

  // Media smaller than this in either axis is an icon or an avatar. It is
  // rendered lighter and never outlined, which is most of the difference
  // between a wireframe and a field of grey squares on a dense page.
  const ICON_MAX = 56;

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
  const NEST_TOL = 30;

  // A child filling this much of its nearest boxed ancestor is that ancestor
  // with padding, not a second structure worth outlining.
  const NEST_AREA_RATIO = 0.6;

  // How many levels of BOXED nesting to draw. Counted in outlines, not in
  // markup, so a card inside a column inside a page is depth 2 no matter how
  // many wrapper divs sit between them. Real pages nest far deeper than a
  // wireframe should show; past this the boxes stop describing structure and
  // start tracing the DOM.
  const MAX_DEPTH = 3;

  // Content that makes a leaf box worth drawing. A leaf holding one of these is
  // a real component (a thumbnail, a control); a leaf holding only text is a
  // paragraph wrapper, and the grey bars already show it.
  const LEAF_KEEP =
    "img, video, canvas, svg, picture, iframe, object, embed," +
    "input, button, select, textarea";

  const ALL_CLASSES = [BOX, REL, TEXT, THIN, HEAD, ICON, ...VARIANT_CLASSES];

  // The DOM is the source of truth for what we tagged, so there is no parallel
  // array to keep in sync and nothing pinning up to 1500 detached nodes alive
  // between passes.
  function clearTags() {
    for (const el of WD.queryAll("." + BOX + ", ." + TEXT + ", ." + ICON)) {
      try {
        el.classList.remove(...ALL_CLASSES);
        el.style.removeProperty("--wd-lh");
        el.style.removeProperty("--wd-tw");
        el.style.removeProperty("--wd-tx");
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
    const icons = [];
    const seenRects = new Set();
    // element -> { rect, depth, hasChild }. Depth counts boxed ancestors, not
    // DOM ancestors, so it measures visible nesting rather than markup nesting.
    const kept = new Map();
    // One Range reused for every measurement rather than one per element.
    const textRange = document.createRange();

    // Nearest already-boxed ancestor, crossing shadow boundaries via the host.
    // Walking up is O(depth), not another pass over the candidate list.
    function boxedAncestor(el) {
      let node = el;
      for (let hops = 0; hops < 24; hops++) {
        let parent = node.parentElement;
        if (!parent) {
          const root = node.getRootNode && node.getRootNode();
          parent = root && root.host ? root.host : null;
        }
        if (!parent) return null;
        const entry = kept.get(parent);
        if (entry) return entry;
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
      // Small media is an icon or an avatar: tag it light and stop. This has to
      // happen before the size floors below, which would otherwise drop it.
      if (media && (w < ICON_MAX || h < ICON_MAX)) {
        if (w >= 4 && h >= 4) icons.push(el);
        continue;
      }
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
        let tx = 0;
        try {
          textRange.selectNodeContents(el);
          const tr = textRange.getBoundingClientRect();
          tw = tr.width;
          // Where the text actually starts, relative to the content box. For
          // centred or right-aligned text this is non-zero, and without it the
          // bar would be painted hard against the left edge.
          const contentLeft =
            rect.left +
            (parseFloat(cs.borderLeftWidth) || 0) +
            (parseFloat(cs.paddingLeft) || 0);
          tx = tr.left - contentLeft;
        } catch (e) {
          /* fall back to full width, left aligned */
        }
        texts.push({
          el,
          head: /^H[1-6]$/.test(el.tagName) || fs >= 24,
          lh: isFinite(lh) && lh > 0 ? lh : fs * 1.2,
          // Only worth setting when the text is meaningfully narrower than its
          // box; otherwise leave the CSS default of 100%.
          tw: tw > 0 && tw < w - 2 ? tw : 0,
          tx: Math.abs(tx) > 1 ? tx : 0
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

      const near = boxedAncestor(el);
      const depth = near ? near.depth + 1 : 0;
      if (depth > MAX_DEPTH) continue;
      if (near) {
        const nearRect = near.rect;
        const tight =
          Math.abs(nearRect.top - rect.top) <= NEST_TOL &&
          Math.abs(nearRect.left - rect.left) <= NEST_TOL &&
          Math.abs(nearRect.right - rect.right) <= NEST_TOL &&
          Math.abs(nearRect.bottom - rect.bottom) <= NEST_TOL;
        // A fixed pixel tolerance cannot catch a padding-only wrapper: 16px of
        // padding is well past it, yet the two boxes are the same box to the
        // eye. Area ratio is scale-independent and does catch it.
        const nearArea = nearRect.width * nearRect.height;
        const filled = nearArea > 0 && (w * h) / nearArea > NEST_AREA_RATIO;
        if (tight || filled) continue;
      }

      seenRects.add(key);
      if (near) near.hasChild = true;
      const entry = { rect, depth, hasChild: false };
      kept.set(el, entry);
      boxes.push({
        entry,
        el,
        isStatic: cs.position === "static",
        // Below the sketch-viable size the border-image would render as four
        // corner ticks, so these get the crisp hairline instead.
        thin: w < SKETCH_MIN || h < SKETCH_MIN
      });
      if (boxes.length >= MAX_BOXES) break;
    }

    // Drop leaf boxes that wrap nothing but text. This is the single biggest
    // source of clutter on a dense page: every paragraph and list item sits in
    // its own div, and outlining each one traces the DOM rather than describing
    // the layout. The outermost box is always kept so the page never loses its
    // frame, and a leaf holding real content (see LEAF_KEEP) is kept because
    // the outline is the only thing marking it out.
    const drawn = boxes.filter(
      (b) =>
        b.entry.depth === 0 ||
        b.entry.hasChild ||
        b.el.querySelector(LEAF_KEEP) !== null
    );

    // WRITE phase. No reads, so no interleaved style recalc.
    drawn.forEach((b, i) => {
      b.el.classList.add(BOX, VARIANT_CLASSES[i % VARIANT_CLASSES.length]);
      if (b.isStatic) b.el.classList.add(REL);
      if (b.thin) b.el.classList.add(THIN);
    });

    for (const i of icons) {
      try {
        i.classList.add(ICON);
      } catch (e) {
        /* node gone */
      }
    }

    for (const t of texts) {
      try {
        t.el.classList.add(TEXT);
        if (t.head) t.el.classList.add(HEAD);
        t.el.style.setProperty("--wd-lh", t.lh + "px");
        if (t.tw) t.el.style.setProperty("--wd-tw", t.tw + "px");
        if (t.tx) t.el.style.setProperty("--wd-tx", t.tx + "px");
      } catch (e) {
        /* ignore */
      }
    }
  }

  WD.onRescan(() => retag(WD.state));

  WD.register({
    name: "wireframe",
    flags: { wireframe: false, greek: false },
    active: (s) => s.wireframe || s.greek,
    css(state) {
      let out = "";
      if (state.wireframe) {
        out += BASE_CSS + SKETCH_GEOMETRY + sketchRules();
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
