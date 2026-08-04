// WireDrafter - engine (shared plumbing for every content module).
//
// Injected on demand by the service worker, ISOLATED world only. This file owns
// what every mode needs and nothing mode-specific:
//   - a stylesheet mirrored into every shadow root (open AND closed)
//   - shadow-tree traversal via chrome.dom.openOrClosedShadowRoot(), cached
//   - a MutationObserver that keeps both of the above true as the page changes
//   - a module registry and the state machine driven by the worker
//
// The engine knows nothing about its modules' vocabulary. Modules declare their
// own flags, their own "am I active" predicate, and their own lifecycle edges at
// registration; the engine merges the defaults and derives everything else. A
// new module lands without editing this file.
//
// No selector emitted here or by a module is scoped behind an `html.wd-*`
// class: the same CSS text has to work unmodified inside a shadow root, where
// `html` is not reachable. The presence of a rule IS the on/off gate.

(function () {
  "use strict";

  // Re-injection guard. executeScript into a frame that already has us is a
  // no-op, so the worker can inject unconditionally on every toggle.
  if (window.__WD) return;

  const MARK = "data-wiredrafter";

  const WD = (window.__WD = {
    state: {},
    modules: [],
    register(mod) {
      this.modules.push(mod);
      mod._active = false;
    }
  });

  // Run fn over every module, isolating failures so one broken module cannot
  // take down the rest.
  function eachModule(fn) {
    for (const m of WD.modules) {
      try {
        fn(m);
      } catch (e) {
        /* isolate */
      }
    }
  }

  // --- Node ownership -------------------------------------------------------
  //
  // Modules must never tag, drag or delete a node the extension created. They
  // ask the engine rather than hardcoding its private marker names, and the
  // traversal below simply never hands one out.

  WD.claim = function (el) {
    try {
      el.setAttribute(MARK, "1");
    } catch (e) {
      /* ignore */
    }
    return el;
  };

  // closest(), not hasAttribute(): only the root of an extension-created tree
  // is claimed, and contenteditable generates children we never see (pressing
  // Enter in a text box makes fresh <div>s). Those must count as owned too.
  WD.isOwnNode = function (el) {
    try {
      return !!(el && el.nodeType === 1 && el.closest("[" + MARK + "]"));
    } catch (e) {
      return false;
    }
  };

  // The CSS counterpart of isOwnNode. The engine owns the marker name, so it
  // owns the escape hatch; modules compose this instead of spelling the
  // attribute out, which is how one rule block got missed.
  WD.NOT_OWN = ":not([" + MARK + "], [" + MARK + "] *)";

  // --- Shadow DOM -----------------------------------------------------------

  const hasShadowApi =
    typeof chrome !== "undefined" &&
    chrome.dom &&
    typeof chrome.dom.openOrClosedShadowRoot === "function";

  function shadowRootOf(el) {
    if (!hasShadowApi) return null;
    try {
      return chrome.dom.openOrClosedShadowRoot(el);
    } catch (e) {
      return null;
    }
  }

  // Visits `node`'s own shadow root as well as its descendants', so callers
  // never have to hand-roll the own-root case (which every caller previously
  // did, in two files, four lines at a time).
  function walkShadows(node, visit) {
    if (!hasShadowApi || !node) return;
    const own = shadowRootOf(node); // null for document
    if (own) {
      visit(own);
      walkShadows(own, visit);
    }
    let els;
    try {
      els = node.querySelectorAll ? node.querySelectorAll("*") : [];
    } catch (e) {
      return;
    }
    for (const el of els) {
      // Never descend into a shadow root the extension owns. Mirroring the
      // renderer's stylesheet into our own UI would defeat the point of putting
      // it behind a shadow boundary in the first place.
      if (WD.isOwnNode(el)) continue;
      const root = shadowRootOf(el);
      if (root) {
        visit(root);
        walkShadows(root, visit);
      }
    }
  }

  // The shadow walk costs one privileged binding call per element, so the root
  // list is computed once per apply() and reused by setCss and by every module,
  // instead of three separate walks per toggle.
  let rootsCache = null;
  WD.invalidateRoots = () => {
    rootsCache = null;
  };
  WD.roots = function () {
    if (rootsCache) return rootsCache;
    const out = [document];
    walkShadows(document, (r) => out.push(r));
    rootsCache = out;
    return out;
  };

  // Query across the light DOM and every shadow tree, never returning a node
  // the extension owns.
  WD.queryAll = function (selector) {
    const out = [];
    for (const root of WD.roots()) {
      let found;
      try {
        found = root.querySelectorAll(selector);
      } catch (e) {
        continue;
      }
      for (const el of found) {
        if (!WD.isOwnNode(el)) out.push(el);
      }
    }
    return out;
  };

  // --- Stylesheet -----------------------------------------------------------

  let currentCss = "";
  const styleEls = new WeakMap(); // root -> our <style> in it

  function applyCssTo(root, css) {
    try {
      let el = styleEls.get(root);
      if (!el || !el.isConnected) {
        el = document.createElement("style");
        WD.claim(el);
        (root === document ? document.head || document.documentElement : root).appendChild(el);
        styleEls.set(root, el);
        el.textContent = css;
        return;
      }
      // textContent materialises the whole sheet as a fresh string, so it is
      // only touched when the CSS genuinely changed, never per mutation batch.
      if (el.__wdCss !== css) {
        el.textContent = css;
        el.__wdCss = css;
      }
    } catch (e) {
      /* detached root */
    }
  }

  function removeCssFrom(root) {
    try {
      const el = styleEls.get(root);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      styleEls.delete(root);
    } catch (e) {
      /* ignore */
    }
  }

  WD.setCss = function (css) {
    css = css || "";
    if (css === currentCss && css) return; // nothing to repaint
    currentCss = css;
    const roots = WD.roots();
    if (!currentCss) {
      for (const r of roots) removeCssFrom(r);
      return;
    }
    for (const r of roots) applyCssTo(r, currentCss);
  };

  // --- Observer -------------------------------------------------------------
  //
  // Runs only while a module is active. It performs no layout reads, so it
  // cannot thrash. Modules opt in to a debounced rescan for work that does need
  // measurement; the debounce lives here so every module shares one schedule
  // rather than stacking its own on top.

  let observer = null;
  let rescanTimer = null;
  const rescanHooks = [];
  WD.onRescan = (fn) => rescanHooks.push(fn);
  WD.invalidate = scheduleRescan;

  function scheduleRescan() {
    if (rescanTimer) return;
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      if (!isActive()) return;
      WD.invalidateRoots();
      for (const fn of rescanHooks) {
        try {
          fn();
        } catch (e) {
          /* keep other hooks alive */
        }
      }
    }, 150);
  }

  function startObserver() {
    if (observer || !window.MutationObserver) return;
    try {
      observer = new MutationObserver((mutations) => {
        if (!isActive()) return;
        const deep = currentCss && hasShadowApi;
        let sawNodes = false;
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (!node || node.nodeType !== 1) continue;
            // Our own <style> insertions are mutations too. Without this the
            // observer would see setCss(), schedule a rescan, and every toggle
            // would run the whole measure-and-tag pass a second time.
            if (WD.isOwnNode(node)) continue;
            sawNodes = true;
            if (deep) walkShadows(node, (x) => applyCssTo(x, currentCss));
          }
        }
        if (sawNodes) {
          if (currentCss) applyCssTo(document, currentCss);
          scheduleRescan();
        }
      });
      observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true
      });
    } catch (e) {
      /* ignore */
    }
  }

  function stopObserver() {
    if (observer) {
      try {
        observer.disconnect();
      } catch (e) {
        /* ignore */
      }
      observer = null;
    }
    if (rescanTimer) {
      clearTimeout(rescanTimer);
      rescanTimer = null;
    }
  }

  // --- State machine --------------------------------------------------------

  function defaults() {
    const out = {};
    eachModule((m) => Object.assign(out, m.flags || {}));
    return out;
  }

  function moduleActive(m) {
    return m.active ? !!m.active(WD.state, m) : false;
  }

  // "Is the extension doing anything to this page." Chrome modules (a toolbar,
  // a HUD) have no flags of their own and want to appear whenever some renderer
  // is running; without this they would have to hardcode another module's flag
  // names, which is the coupling this engine exists to prevent.
  //
  // `except` is required, and the re-entrancy guard covers the case of two
  // chrome modules each asking about the other.
  let asking = false;
  WD.anyActive = function (except) {
    if (asking) return false;
    asking = true;
    try {
      return WD.modules.some((m) => m !== except && moduleActive(m));
    } finally {
      asking = false;
    }
  };

  function isActive() {
    return WD.modules.some(moduleActive);
  }

  WD.apply = function (next) {
    WD.state = Object.assign(defaults(), next || {});
    WD.invalidateRoots();

    // Lifecycle edges first, then in-state updates, then paint. The tagging
    // pass must add its classes before the CSS that targets them lands, or
    // there is a frame with rules and nothing tagged.
    eachModule((m) => {
      const now = moduleActive(m);
      if (now && !m._active) {
        m._active = true;
        if (m.mount) m.mount(WD.state);
      } else if (!now && m._active) {
        m._active = false;
        if (m.unmount) m.unmount();
      }
      if (now && m.update) m.update(WD.state);
    });

    let css = "";
    eachModule((m) => {
      if (m._active && m.css) css += m.css(WD.state) + "\n";
    });
    WD.setCss(css.trim());

    if (isActive()) {
      startObserver();
      window.addEventListener("resize", scheduleRescan, { passive: true });
    } else {
      stopObserver();
      window.removeEventListener("resize", scheduleRescan);
    }
  };

  // The worker broadcasts to every frame at once and a single sendMessage has
  // one response channel, so this deliberately does not sendResponse: if every
  // frame answered, all but the first would race and log "channel closed".
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "wiredrafter:setState") return;
      WD.apply(msg.state);
    });
  } catch (e) {
    /* not a content script context */
  }
})();
