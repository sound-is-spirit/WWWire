// GreyOut — ISOLATED world content script.
//
// This is the whole extension's engine — it runs at document_start in every
// frame (all_frames + match_about_blank), entirely within the ISOLATED world.
// There is NO MAIN-world injection and NO host-page prototype patching. It:
//   1. Builds a stylesheet with an embedded Base64 "Redacted" web font plus a
//      UNIVERSAL glyph-substitution rule: every text glyph becomes a solid grey
//      block. No background boxes are used, so masked regions never stack into
//      darker nested boxes, and the standing `*` rule matches nodes the instant
//      they paint — nothing can be "missed".
//   2. Applies it to the light DOM via an injected <style> (plus
//      adoptedStyleSheets), and to open/closed Shadow DOM via the privileged
//      chrome.dom.openOrClosedShadowRoot() API — no attachShadow monkey-patch.
//   3. Reads the user toggle (chrome.storage.local) to decide the state. A
//      lightweight observer (active only while masking) keeps the style
//      attached and catches shadow roots inside newly added nodes.

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Embedded fonts (WOFF2, Base64). "Redacted" by Christian Naths (OFL).
  //   - REDACTED_SCRIPT: handwriting-style scribble.
  //   - REDACTED_BLOCK : solid geometric blocks (used as the primary glyph
  //                       substitute; keeps exact text geometry => zero shift).
  // Embedding as a Data URI avoids any network request / Flash Of Unstyled
  // Content and lets the same @font-face live inside every Shadow Root.
  // ---------------------------------------------------------------------------
  const REDACTED_BLOCK_B64 =
    "d09GMgABAAAAAA74ABAAAAAAPjAAAA6ZAAEAgwAAAAAAAAAAAAAAAAAAAAAAAAAABmAAh3gIYAmcDBEICqlIqgsBNgIkA4owC4UaAAQgBYhcB4pqDIE9FyQYhRobwTojA3VptAoVwX86boyBhWD1pEKtZtmd9JyBZxAjogQ3cYRBggPhCqcQ3oM4KptFKiQyPrjOvn91Vlx59whJZiGiMXNmL89YIHIIbMuSbVVVHbFQFYZZESXD42n/OoiZVE5S1qbgLk0G8vx3/ufJR4p/gGPY+9u4ApOgkiqBo8AHNMDpXZOeyNFZKqRXMm+FxivxAPuihms+XoUacJoHALexlOtvAIqJDV7AiBWef239vKjAg7zw8D0ZxL4MljXwj+ehCTtsUf+inq66Gdw+/bXkXBDNzJv3745sUSG2iElyMj00JRVVTVth0ppNsjkqMT8ASHTq6swLWdgGg/sL/f9f+189+86d74g16qBJ+38fQvmpki7nzfz1R5D33hezwcyyeRO1ZpbpeKRCDCxCYdE6dCq5ERotYnOMEikqf9sXXHiyLV2hrk25EjGNFMLQ/Zovr4FM++xBGvEa6QAmqTv2BqrbNnrdD5xfBtCewX9i/GnAftDvSG1zM5DmOD4XOK2Ka+voARKoJUnxK5YafA1gI3/SuiPxUJWsNRpqqoUOUnTT13BjzBKRp9gq+8IwjsWJuJP2tz2OuIIIUWPFCxh2tavR1KEuaZnnm1eYV3PDI6/M+GM+keDkr8jlgLbIPI2kZL0mmmsvUVc9DDDaeHPlKrTEvtCLo3Eirqf9bYc9zgBl7xdURR/A0Fy2c+Qt5YYB2ZFseXb5/7sGADz/ef/V/YcAPP+BX737jfdSkL8dI/rUqVG5V3Kv8O6/p+6euHv0VkUXINgIcDQVH/vSz/7wl3+CGIjSaA6joIZ/BEY0IE4QGXGwWD9xhPjNcovf/vhbT/4J47MPhTVK8iEp88y3wFq11VHOIlSiVCUNhoyYgtiy44CEzIUPX36ChIuWIlWadFnepMCX+vM8GhximBJl6jVo1qJbjz5Dhq212RZb7bDXhEVLlu1z0Nt0+VSj4SraS6Ikyfrqp7P+HPW5JiMM0MVADXjoUa6wClLJITx2zHdPPPUsZUK6Q/6vyzLKamjRpsOMOQuW8lG4cuPOg2eGwGLEihMvQ4HjuHj4BIRETsCVq1CpSqs27TqctNI66/1nxIaMOGXSlGkz9jvtADnbydtBwU4q9lK1j7pSdGfoqqanhr5aBuoYa2SiiZVO1rrYOMteL0f9nAwgGsRwDtUqNKs5W8PLRt42QZznb5sA/wu0XbCdQuwSarcIoyKNSTAr0Zwk85ItyJTtkByH5ToizB5Rxn3xwztf/fTeN79UXuOQryG8PSgh/5WY9G/qeaxkEt1k7X4yAALu09REnv5DzX6KfvsxMZqn9pyX0r89wVr+m6aA0UK/O+/BM6BOBlgwxwCBXFgGGOrVBxSk+6k6h1bimCAl51i5M461nCbMt/uCS2COS4dc7Q+cSjFH8pMTvtU/eLqruyck8mkcgrbNHE3BVfphQ8SmOibxKU+YSVWVIpbh7TrphINAko9DzVY5XUzR95NHqb3+lJb8rv90PF592bsRZqapmz2bVFFcOmrd0ipO9JyeBR2ayFJ6O0bksHPi5CCOQyMmNMnKZitngBUXF+AmgdOx7XGq6yIzeOa0/POZBfA8/zQzNOuKQd7ME7L7SIQaLaBBpoJo6QSDewlDIqZE571BIaCHXSn5mmoMoxhxvz3XD1ZU7zxMF2gr/vYpfe7n3/rayyqSvEp5z5XXltS8CbvbpI7jxzqmowYMYHE0IAX2yWxqSVQBv24KPFxCoyyMlSvHgjh9GA8X/8QMBVjOLphpJE/kyRwYrJrhNF72GUTOSTPKc6Gdn7wCIppl2hejdEEPYz4yjeTm2QUuC6WkN+lqbtyHCVEqA1MckId79kx+uismre8l79TbZR/wonJqn784CfgABRG8fAKukuCVaPi0uIGvOOAHCAbnlPJPzKgvRvzM0n85ryZJTxnA07epynhiZ3FPdD+hYNmr9PTNNOT8pQU7DaGiNX6XGnBnhmLE7w0Q1li9A/hODU2poHQvVTLMiOT0tut+eN+KVyjqPAcj7vcMLqoML+enkn7pZKI2NbE8a4Wp0QlEsDmQtfN7FsZKJaW/TQQkyhSPRNyCClHy39jMqmmuHFiJMTJBoUuGYg0VPHs/f8YCEVR0R4GoF0QxwRQXihJCKCk0Sgmd0sKgjDApK6yCJjQNR0QPT98mlQZ6P2tWDrSMoiPyK3E7uiK/91gOK1R4f8ug+HvKYhI/kYdDAQ5FOJTgUIZDBQ5VONTgUIdDA660A2kzl7r+TCzIWGMuDbv4MJ3SreqBrv/fNyuBPkTmktQSLVt6gZ96oONYoIE5Kame3H7hHY3+StVsd5qumrfeMExTDy0dQW55kD/GipjDPvWaIe8St58RU79ggNH3dKuObNfnPTKBtDL3IwvQ3qHAFM2RNjDbpxjiYu25zlHZTJ2TRuZAIqyPe/tQ5lokfXfeIInDzNruwcuBBcAUUYmIImp+6uoyuzg5+tF3RKTtZ1sSy4g04wZBl2h118LXVRJ21+mnuE3nfkqyOWcxquCg9EXLLJ1lWx1hL/iqZ96dDiPMnaKxdHMqDBWnTr7iTdY2u6iUTpPorGw5xcEZrO8g2RKzDBwVthJOjsqmNS1o6DlIcjRCbeWsK+pElBUWWHFiS5quJSJL262Z6HUEByx11rhzTuaADSTYK5NxlXRzlxpp1buUqSPu9RfDkK5wlsfPMGY0p1j0VtIcyf0B2zUnIWWxyUwuLGcpsa7ZQaVhUz1PHWXac68tSWtN7dnOiAo8Sv7a7c35GGOqLbf4BCx8x01PwdL3ucGltpT9bB8fOht6RTqLYKpMvSQBdQWXxBBwpg6r0kqjWzTv8XNUR0YjmMrtb2JezOwbX882bHXL+bJJ9+YuXRRgdcSOfQnVSPc6ZK8mCQWuvO7pHx5wpqceyGMmK31yXXWDChuGmGrxLZi/6e5EmJqqNDLri5G18D0yO8Rd5HvAQAGMA0JIdhyBIyS3FTDhCcmPIwiE/hA/AVSASJPieIJEk9LWgMg0KY8nKDSdkhq6qFhSI46gKaRWK2ChLaROHEFX6Pbcg6b1uaZBPMFQk0atATHWpEk8wVSzcYaKi6Q714aQIrmA7CyDH5RQyleohNJap7bRSdtMPDp28rGX7x2aoNARhCRryPIEhc6ZCBcXGa4y3GS4y/CQ4SnDK3p4y+Ejh68cfnL4yyFgy63SPf6cT7hN0OcHSYELJ/XOm8UR5oSfJllO/9+0//GRAhD4P0cFwH0AxBsAQQYUoOAroPgRQNP/DaAkBv9C7Uydr1TQlKD3Pc/1k2kiQJkfOdkqK+AXHz/0AwASpD6f4VsJgracYgBaiQVI0liSa+hhEIAOLf3++DxV7++FFek9AJ68FYZUK71nvjzo5yVfABBpLjcDvgCyt/ZAUIfdB3yVZjseLJ2lwlb7SLF8GCFfO50A3YeVkKDMWZIcKgJuAdJQpXkjlLtrJINdNzLapmLkGRvRyNc2zCjUugEU6eNGiaWdN0oNHCAaZbWPgtsvN3iwgSAihUqhOFjYMBAqMgoasJMTIEdLhGCA0WHiaJB4KBEuZNktJAAOwx4SJQaxxTwbppCYJxISFg7w7LgCRHQiAiR0bBeOLobhgAkJwfBNiZGg9K/bCZOIEMbONdZ/6Sw4PhiKgoiMjMpLrDixQnjZzsZpPHlYUhBS2U+X48ysEJkL+Z3LBDNii8zlOMzCLbLYe+6IaOycmX0QNwWQ2PE0gGY8+0kn6qGTkkwLnkXKpcTATBCaAkgC0y32Ox8B1Ta/2XScLyROg40jMIAyvougjB4hGiROoc2kBLNGI8FxSqnjbbPIp0yf4pQfVgTGoWphBfiA/sW8smT63AAJuk1jPEE8tRGjo5CZccWoLvFssVnc9ogTKto6ImGj73JnVqgA+gPnPoCOdjvhmD0K0JMwmaETawx//KNL0nR1CuK4k8lYYKFFdGPve8X04Oic0844m6Kl/OGEmDJ9UrHCSsgomKmroSZUl5x3wV6stNSGxplLOuqqh2v6/PI4A9wy1Ehj3F112RXsTDQV0gwPnrx4e2WBT+Za8FSPF3q9yZKHRrPSWhuCcXHwCPAJs9VOe0KEEvkbjMuBcCsUQolz1EmiJCJE+lFfokTDYYoUR5FKjNhoxOWsi67ES1CSm+56kKhMqXKVKvLUiyTJUvLWR19S8+O3J/mTVoCBBpGuWpUatQUbYqhhZMiUJdtr83IKN4Jn1lmv1YiXNngbgXseGbPVfgescd2DIr9IeNm69OgzYMioKKON4YvPvgqkZtwERUPlOuwIJcPl227apGU7zJiy7yuHsxcqUqxMhSoajJmMf05+NjlkozoHNdvpKBVtQMzkgW3W771Zi1YWy2qrvCvOeLbos9Y23QYMknVYoyVDJRAgSJebOt11y2133HfDPc81ademXouOEpkj2SyTTTG1IGALTEdFQpmAlShShMgGbPsqrZonE7wKTtNkQ0BVCiGrRRjgr9XUlwWUIWPjWzlkStuqCAvlTTOzvagbJVrzcQxppkfQemGZ2NZB/SAmpheH9dHKcetxIQtGcQEfxjGZxFH7YZTEREn51GZWc++SDOov31xWUlQKdlg65Qu3RZRTCBRj9cnNxMxUyOxtSCa4GoYxdKWRdqzzyI9BX950Cg6ehHVYMnQkEaIjAUi7TnECOckm4bd9Cj9A2HYUoS4KFAWgbSdBA8T6kuwhGB46ruGBuI7Lsugy87Dpz4W1/q2qd2JpT6XWY7NmKFqckD1toPwPiOZ+6fda5ryk877CCy7OTZ56I+o7xw82JuHYglE/4Dzi7Riyq1ewmrZB96axr3fPGBRqZCSLp131DvN8nTi8wuqd4v35+zP7kVRipBzBf4vFGW8iidEfOtoyI310eMv8ilaLrnmzhWA4GKPPDce6jJvMF9ZAGOIzViUb8MZ9nekZRvlaIVne/Yb/juB0XrTA6E95jHwweh0QRiH8ypam9wD4N6suIvE9iaqyNJegGgAAAA==";
  const REDACTED_SCRIPT_B64 =
    "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";

  function buildCss() {
    // Elements that must NOT be turned into blocks — icons, imagery, media.
    // Re-asserted AFTER the universal rule (higher specificity) so glyph-icon
    // fonts render as icons instead of solid blocks. SVG / <img> / media are
    // not text, so they are unaffected by the block font either way; the
    // class-based hooks below cover icon-font glyphs (e.g. Material Icons,
    // Font Awesome, etc.) across arbitrary sites.
    const ICON_KEEP = [
      "svg", "svg *", "path", "g", "use", "symbol",
      "img", "picture", "canvas", "video",
      'i[class*="icon" i]', 'span[class*="icon" i]',
      'i[class*="glyph" i]', 'span[class*="glyph" i]',
      'i[class*="symbol" i]',
      "[data-icon-name]", '[class*="Symbol" i]', '[role="img"]'
    ].join(",\n");

    return `
@font-face {
  font-family: 'GreyOut Block';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(data:application/font-woff2;charset=utf-8;base64,${REDACTED_BLOCK_B64}) format('woff2');
}
@font-face {
  font-family: 'GreyOut Script';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(data:application/font-woff2;charset=utf-8;base64,${REDACTED_SCRIPT_B64}) format('woff2');
}

/* ============================================================
   UNIVERSAL TEXT REDACTION
   Every text glyph in the document — and inside every adopted Shadow Root,
   since the selector is unscoped and therefore applies within shadow trees
   too — is rendered with a solid-block font in flat grey.

   Why this beats background-box masking:
     - COVERAGE: a single star rule catches ALL text; nothing can be missed.
     - NO NESTED BOXES: we never set a background colour, so overlapping
       redacted elements can never stack into darker patches.
     - ZERO LAYOUT SHIFT: the block font preserves each glyph metrics.
     - ICONS SURVIVE: SVG/img are not text, and glyph-font icons are restored
       by the ICON_KEEP rule below. */
* {
  font-family: 'GreyOut Block', 'GreyOut Script', monospace !important;
  color: #bcbcbc !important;
  -webkit-text-fill-color: #bcbcbc !important;
  caret-color: transparent !important;
  text-shadow: none !important;
}

/* Also redact placeholder / selection text so empty inputs and highlighted
   ranges can't leak the underlying value. */
*::placeholder {
  color: #bcbcbc !important;
  -webkit-text-fill-color: #bcbcbc !important;
}
*::selection {
  color: #bcbcbc !important;
  background: transparent !important;
}

/* Restore icons/imagery so they render as icons, not blocks. Higher
   specificity than the star rule, so this wins for the icon font-family.
   A broad stack of common icon fonts is listed so glyph icons resolve on most
   sites; SVG/img are unaffected by font-family regardless. */
${ICON_KEEP} {
  font-family:
    'Material Icons', 'Material Icons Outlined', 'Material Symbols Outlined',
    'Font Awesome 6 Free', 'Font Awesome 6 Brands', 'Font Awesome 5 Free',
    'FontAwesome', 'bootstrap-icons', 'codicon', 'Ionicons',
    'Glyphicons Halflings', 'Segoe Fluent Icons', 'Segoe MDL2 Assets' !important;
}
`;
  }

  const CSS_TEXT = buildCss();

  // Constructable stylesheet — parsed exactly once by the engine.
  let sheet = null;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS_TEXT);
  } catch (e) {
    sheet = null; // very old engine w/o Constructable Stylesheets — see fallback
  }

  const supportsAdopted = sheet !== null && "adoptedStyleSheets" in document;

  // PRIMARY mechanism for the light DOM: a plain <style> element. An injected
  // <style> from a content script applies 100% reliably regardless of realm;
  // adoptedStyleSheets is kept as a harmless secondary.
  let styleEl = null;
  function ensureStyleEl() {
    if (styleEl && styleEl.isConnected) return styleEl;
    styleEl = document.getElementById("greyout-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "greyout-style";
      styleEl.textContent = CSS_TEXT;
    }
    return styleEl;
  }

  function applyLightStyle() {
    try {
      const el = ensureStyleEl();
      if (!el.isConnected) {
        (document.head || document.documentElement).appendChild(el);
      }
    } catch (e) {
      /* ignore */
    }
    if (supportsAdopted) {
      try {
        if (!document.adoptedStyleSheets.includes(sheet)) {
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        }
      } catch (e) {
        /* ignore */
      }
    }
  }

  // --- Shadow DOM piercing, WITHOUT touching the host page ------------------
  // chrome.dom.openOrClosedShadowRoot() lets an ISOLATED-world content script
  // read open AND closed shadow roots directly. This replaces the former
  // MAIN-world attachShadow monkey-patch (which risked WAF fingerprinting,
  // prototype pollution and event spoofing). We inject a <style> into each
  // shadow root — reliable across realms and trivially removable.
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

  function styleOneShadow(root) {
    try {
      if (root && !root.querySelector("style[data-greyout]")) {
        const s = document.createElement("style");
        s.setAttribute("data-greyout", "1");
        s.textContent = CSS_TEXT;
        root.appendChild(s);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function unstyleOneShadow(root) {
    try {
      const s = root && root.querySelector("style[data-greyout]");
      if (s && s.parentNode) s.parentNode.removeChild(s);
    } catch (e) {
      /* ignore */
    }
  }

  // Visit every shadow root reachable from `node` (recursing into nested trees).
  function walkShadows(node, visit) {
    if (!hasShadowApi || !node) return;
    let els;
    try {
      els = node.querySelectorAll ? node.querySelectorAll("*") : [];
    } catch (e) {
      return;
    }
    for (let i = 0; i < els.length; i++) {
      const root = shadowRootOf(els[i]);
      if (root) {
        visit(root);
        walkShadows(root, visit);
      }
    }
  }

  function applyToDocument() {
    applyLightStyle();
    walkShadows(document, styleOneShadow);
    startObserver();
  }

  function removeFromDocument() {
    stopObserver();
    try {
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    } catch (e) {
      /* ignore */
    }
    if (supportsAdopted) {
      try {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
          (s) => s !== sheet
        );
      } catch (e) {
        /* ignore */
      }
    }
    walkShadows(document, unstyleOneShadow);
  }

  let currentEnabled = false;
  function setState(enabled) {
    currentEnabled = enabled;
    if (enabled) applyToDocument();
    else removeFromDocument();
    try {
      console.info(
        "[GreyOut] " +
          (enabled ? "ON" : "OFF") +
          (window.top === window ? " (top frame)" : " (frame)")
      );
    } catch (e) {
      /* ignore */
    }
  }

  // A single observer, active ONLY while masking, that (a) re-attaches our
  // light-DOM <style> if the page removes it and (b) styles shadow roots found
  // inside newly added nodes. It performs no layout reads, so it never thrashes.
  let domObserver = null;
  function startObserver() {
    if (domObserver || !window.MutationObserver) return;
    try {
      domObserver = new MutationObserver(function (mutations) {
        if (!currentEnabled) return;
        if (!styleEl || !styleEl.isConnected) applyLightStyle();
        if (!hasShadowApi) return;
        for (let m = 0; m < mutations.length; m++) {
          const added = mutations[m].addedNodes;
          for (let n = 0; n < added.length; n++) {
            const node = added[n];
            if (node && node.nodeType === 1) {
              const r = shadowRootOf(node);
              if (r) {
                styleOneShadow(r);
                walkShadows(r, styleOneShadow);
              }
              walkShadows(node, styleOneShadow);
            }
          }
        }
      });
      domObserver.observe(document.documentElement || document, {
        childList: true,
        subtree: true
      });
    } catch (e) {
      /* ignore */
    }
  }
  function stopObserver() {
    try {
      if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
      }
    } catch (e) {
      /* ignore */
    }
  }

  // --- State source: the user's toggle in storage.local ---------------------
  const hasStorage =
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

  if (hasStorage) {
    chrome.storage.local.get({ enabled: false }, function (res) {
      setState(!!(res && res.enabled === true));
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes.enabled) {
        setState(changes.enabled.newValue === true);
      }
    });
  } else {
    setState(false);
  }
})();
