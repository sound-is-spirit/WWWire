// WWWire - floating toolbar.
//
// Mode checkboxes plus "add a Container / Text Box" spawners. Added elements
// are draggable, natively resizable (`resize: both`), deletable, and edited
// with native `contenteditable`.
//
// Two things carry most of this file's correctness:
//
//   1. Every node created here is WD.claim()ed. That is what keeps the
//      wireframe renderer's universal rule from repainting our own UI, keeps
//      the tagging pass from treating user-added boxes as page structure, and
//      keeps clearTags() from stripping their classes. Without it each of
//      those has to be patched separately, with inline !important and with the
//      wireframe module hardcoding this module's class names.
//   2. The panel lives in a CLOSED SHADOW ROOT. It sits in the host page's
//      DOM, so without a boundary the page's own CSS reaches it: LinkedIn was
//      enough to render the buttons' label invisible against their own
//      background. Inline !important would only restart that arms race, and it
//      loses to a host rule that also uses !important. A shadow root ends both
//      directions structurally. The engine skips roots it owns, so the
//      renderer's stylesheet is never mirrored inside.

(function () {
  "use strict";

  const WD = window.__WD;
  if (!WD || WD.toolbarLoaded) return;

  // The worker re-injects on every state change and the content scripts are
  // injected with allFrames, so without this guard each toggle would register a
  // second toolbar module with a fresh (null) element reference and mount
  // another physical toolbar. Toolbars would stack, and WD.modules would grow
  // without bound for the life of the document.
  WD.toolbarLoaded = true;

  // Chrome UI is per tab; only the renderer is per frame. Every iframe would
  // otherwise build and append its own fixed-position panel.
  if (window.top !== window) return;

  const PANEL = "wd-toolbar";
  const BTN = "wd-btn";
  const ADDED = "wd-added";
  const TEXT = "wd-added-text";
  const INNER = "wd-text-inner";
  const DEL = "wd-del";
  const GRIP = "wd-grip";
  const SEL = "wd-sel";

  let host = null;   // claimed element in the page, the shadow boundary
  let panel = null;  // the actual UI, inside the shadow root

  // --- Styles ---------------------------------------------------------------
  // Scoped under [data-wwwire], which the engine stamps via WD.claim, so
  // these rules can never touch the host page.

  // Panel styling: goes inside the shadow root only, so nothing here can leak
  // into the page and nothing in the page can reach it.
  const PANEL_CSS = `
.${PANEL} {
  position: fixed; top: 20px; right: 20px; z-index: 2147483647;
  width: 150px; padding: 12px; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 12px;
  background: #fff; border: 2px solid #111; color: #111;
  font: 14px/1.4 system-ui, sans-serif;
  /* Belt and braces: a host page cannot reach in here, but the shadow root
     inherits a few properties from the host element regardless. */
  -webkit-text-fill-color: #111;
}
.${PANEL} h2 { font-size: 14px; font-weight: 700; margin: 0 0 8px; }
.${PANEL} label {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 6px; cursor: pointer;
}
.${PANEL} section + section { border-top: 1px solid #ddd; padding-top: 12px; }
.${PANEL} .hint { font-weight: 400; font-size: 0.85em; color: #666; }
.${BTN} {
  display: block; width: 100%; padding: 6px;
  -webkit-text-fill-color: #fff; margin-bottom: 6px;
  background: #111; color: #fff; border: 1px solid #111;
  font: 700 14px/1.2 system-ui, sans-serif; text-align: center; cursor: pointer;
}
.${BTN}:last-child { margin-bottom: 0; }

`;

  // Added-element styling: these live in the page's light DOM, so they go
  // through the module css() hook the engine injects and mirrors.
  const ADDED_CSS = `.${ADDED} {
  position: absolute; z-index: 2147483646;
  box-sizing: border-box; overflow: hidden;
  background: #fff; color: #111; cursor: move;
  border: 1px solid #111;
}
/* Our own gripper rather than the CSS resize property. The native one paints an OS
   widget that does not belong in a black-and-white wireframe, and it competes
   with the drag handler for the same corner. */
.${GRIP} {
  position: absolute; right: 0; bottom: 0; width: 14px; height: 14px;
  background: #111;    cursor: nwse-resize; z-index: 2147483647; pointer-events: auto;
}
.${TEXT} { padding: 8px; border-style: dashed; }
.${INNER} {
  width: 100%; height: 100%; min-height: 20px; outline: none;
  color: #111; -webkit-text-fill-color: #111; caret-color: #111;
  font: 14px/1.5 system-ui, sans-serif;
}
.${DEL} {
  position: absolute; top: 0; right: 0; width: 22px; height: 22px;
  background: #111; color: #fff; -webkit-text-fill-color: #fff;
  font: 700 15px/22px system-ui, sans-serif; text-align: center;
  cursor: pointer; z-index: 2147483647; pointer-events: auto;
}
.wd-added-drawing {
  background: transparent !important;
  border: none !important;
  pointer-events: none;
}
.wd-added-drawing.${SEL} {
  outline: 1px dashed #111; outline-offset: 2px;
}

/* Handles are chrome, not content: on every box at once they are noise. They
   appear on hover so they are discoverable, and stay while the element is
   selected so a resize does not cancel itself the moment the pointer leaves
   the corner. display rather than opacity, so a hidden handle cannot swallow
   a click meant for the element underneath. */
.${DEL}, .${GRIP} { display: none; }
.${ADDED}:hover > .${DEL}, .${ADDED}:hover > .${GRIP},
.${ADDED}.${SEL} > .${DEL}, .${ADDED}.${SEL} > .${GRIP} { display: block; }
.${ADDED}.${SEL} { outline: 1px dashed #111; outline-offset: 2px; }
`;

  // --- Added elements -------------------------------------------------------

  function addDeleteButton(el) {
    const btn = WD.claim(document.createElement("div"));
    btn.className = DEL;
    btn.dataset.wdDelete = "1";
    btn.textContent = "×";
    // pointerdown, so it wins before the drag logic on the ancestor.
    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      pushUndo({ type: "remove", el: el, parent: el.parentNode });
      el.remove();
    });
    el.appendChild(btn);
  }

  // One pointer-drag helper for both moving and resizing: capture the pointer,
  // coalesce writes to one per frame, tear the listeners down on release, and
  // survive a cancelled gesture.
  function onDrag(handle, opts) {
    let id = null;
    let x0 = 0;
    let y0 = 0;
    let frame = 0;
    let pending = null;

    function flush() {
      frame = 0;
      if (pending) opts.move(pending.dx, pending.dy);
      pending = null;
    }

    function onMove(e) {
      pending = { dx: e.clientX - x0, dy: e.clientY - y0 };
      if (!frame) frame = requestAnimationFrame(flush);
    }

    function stop(e) {
      if (id === null) return;
      try {
        handle.releasePointerCapture(id);
      } catch (err) {
        // Already released, e.g. the gesture was cancelled. Throwing here would
        // abort the rest of this handler.
      }
      id = null;
      if (frame) {
        cancelAnimationFrame(frame);
        flush();
      }
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      if (opts.end) {
        opts.end(Math.abs(e.clientX - x0) > 2 || Math.abs(e.clientY - y0) > 2);
      }
    }

    handle.addEventListener("pointerdown", (e) => {
      if (opts.ignore && opts.ignore(e)) return;
      id = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      handle.setPointerCapture(id);
      opts.start();
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
      e.stopPropagation();
      e.preventDefault();
    });
  }

  function addResizeHandle(el) {
    const grip = WD.claim(document.createElement("div"));
    grip.className = GRIP;
    grip.dataset.wdGrip = "1";
    let w0 = 0;
    let h0 = 0;
    onDrag(grip, {
      start() {
        select(el);
        w0 = el.offsetWidth;
        h0 = el.offsetHeight;
        el.dataset.wdUndoCss = el.style.cssText;
      },
      move(dx, dy) {
        el.style.width = Math.max(40, w0 + dx) + "px";
        el.style.height = Math.max(24, h0 + dy) + "px";
      },
      end(moved) {
        if (moved) {
          pushUndo({ type: "move", el: el, prevCSS: el.dataset.wdUndoCss });
        }
      }
    });
    el.appendChild(grip);
  }

  // Deliberately no `will-change` here. left/top are not compositable, so the
  // hint buys nothing, and setting it on pointerdown promotes the element to a
  // fresh layer at click time. That repaint is what made the delete button and
  // the gripper appear only once the element had been clicked.
  function select(el) {
    for (const other of document.querySelectorAll("." + ADDED + "." + SEL)) {
      if (other !== el) other.classList.remove(SEL);
    }
    if (el) el.classList.add(SEL);
  }

  // Clicking anywhere that is not an added element drops the selection. Capture
  // phase and passive: we only observe, so a page that stops propagation on its
  // own handlers cannot strand a selection, and we never block the page.
  function onDocPointerDown(e) {
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t && t.closest && t.closest("." + ADDED)) return;
    select(null);
  }

  let clipboardElement = null;
  const undoStack = [];

  function pushUndo(action) {
    undoStack.push(action);
    if (undoStack.length > 50) undoStack.shift();
  }

  function performUndo() {
    const action = undoStack.pop();
    if (!action) return;
    
    if (action.type === "add") {
      if (action.el && action.el.parentNode) {
        action.el.remove();
        select(null);
      }
    } else if (action.type === "remove") {
      if (action.el && action.parent) {
        action.parent.appendChild(action.el);
        select(action.el);
      }
    } else if (action.type === "move") {
      if (action.el && action.prevCSS !== undefined) {
        action.el.style.cssText = action.prevCSS;
        select(action.el);
      }
    }
  }

  function onKeyDown(e) {
    const isTyping = e.target.isContentEditable || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";

    if (e.key === "Escape") {
      if (isTyping && document.activeElement) document.activeElement.blur();
      select(null);
      return;
    }

    const selected = document.querySelector("." + ADDED + "." + SEL);

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      if (isTyping) return;
      performUndo();
      e.preventDefault();
      return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      if (isTyping) return;
      if (selected) {
        pushUndo({ type: "remove", el: selected, parent: selected.parentNode });
        selected.remove();
        e.preventDefault();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      if (isTyping && window.getSelection().toString().length > 0) return;
      if (selected) {
        clipboardElement = selected;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      if (isTyping) return;
      if (clipboardElement) {
        const clone = clipboardElement.cloneNode(true);
        
        clone.classList.remove(ADDED, SEL);
        clone.querySelectorAll("." + DEL + ", ." + GRIP).forEach(el => el.remove());
        
        const inner = clone.querySelector("." + INNER);
        if (inner) {
          inner.removeAttribute("contenteditable");
          inner.addEventListener("focus", () => {
            if (inner.textContent === "New Text Box") inner.textContent = "";
          });
          inner.addEventListener("blur", () => {
            inner.removeAttribute("contenteditable");
            if (inner.textContent.trim() === "") inner.textContent = "New Text Box";
          });
        }
        
        const prevLeft = parseFloat(clipboardElement.style.left) || 0;
        const prevTop = parseFloat(clipboardElement.style.top) || 0;
        const newLeft = prevLeft + 20;
        const newTop = prevTop + 20;
        
        const w = parseFloat(clipboardElement.style.width) || clipboardElement.offsetWidth;
        const h = parseFloat(clipboardElement.style.height) || clipboardElement.offsetHeight;
        
        spawn(clone, w, h, newLeft, newTop);
        select(clone);
        
        clipboardElement = clone;
      }
    }
  }

  function makeDraggable(el) {
    let left0 = 0;
    let top0 = 0;
    onDrag(el, {
      ignore: (e) =>
        // The delete button and the gripper own their own corners, and native
        // text editing owns anything inside a contenteditable region.
        (e.target.dataset && (e.target.dataset.wdDelete || e.target.dataset.wdGrip)) ||
        e.target.isContentEditable,
      start() {
        select(el);
        left0 = parseFloat(el.style.left) || 0;
        top0 = parseFloat(el.style.top) || 0;
        el.dataset.wdUndoCss = el.style.cssText;
      },
      move(dx, dy) {
        el.style.left = left0 + dx + "px";
        el.style.top = top0 + dy + "px";
      },
      end(moved) {
        if (moved) {
          pushUndo({ type: "move", el: el, prevCSS: el.dataset.wdUndoCss });
        }
      }
    });

    if (el.classList.contains(TEXT)) {
      el.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const inner = el.querySelector("." + INNER);
        if (inner) {
          inner.setAttribute("contenteditable", "true");
          inner.focus();
          
          // Move cursor to end of text
          const range = document.createRange();
          range.selectNodeContents(inner);
          range.collapse(false);
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      });
    }
  }

  // Claimed at creation, so the engine's observer skips the insertion and no
  // rescan is scheduled: an absolutely-positioned box we own changes nothing
  // about how the page's own elements should be tagged.
  function spawn(el, w, h, forceLeft, forceTop) {
    WD.claim(el);
    el.classList.add(ADDED);
    el.style.width = w + "px";
    if (forceLeft !== undefined) el.style.left = forceLeft + "px";
    else el.style.left = window.scrollX + window.innerWidth / 2 - w / 2 + "px";
    if (forceTop !== undefined) el.style.top = forceTop + "px";
    else el.style.top = window.scrollY + window.innerHeight / 2 - h / 2 + "px";
    addDeleteButton(el);
    addResizeHandle(el);
    makeDraggable(el);
    document.body.appendChild(el);
    pushUndo({ type: "add", el: el });
  }

  function addContainer() {
    if (isDrawingMode) toggleDraw();
    const box = document.createElement("div");
    box.style.height = "200px";
    spawn(box, 200, 200);
  }

  function addTextBox() {
    if (isDrawingMode) toggleDraw();
    const wrap = document.createElement("div");
    wrap.classList.add(TEXT);
    wrap.style.minHeight = "24px";
    const inner = document.createElement("div");
    inner.className = INNER;
    inner.textContent = "New Text Box";
    inner.addEventListener("focus", () => {
      if (inner.textContent === "New Text Box") {
        inner.textContent = "";
      }
    });
    inner.addEventListener("blur", () => {
      inner.removeAttribute("contenteditable");
      if (inner.textContent.trim() === "") {
        inner.textContent = "New Text Box";
      }
    });
    wrap.appendChild(inner);
    spawn(wrap, 200, 40);
  }

  // --- Drawing logic --------------------------------------------------------
  let isDrawingMode = false;
  let drawOverlay = null;
  let drawBtn = null;

  function stopDrawOverlay() {
    if (drawOverlay) {
      drawOverlay.remove();
      drawOverlay = null;
    }
  }

  function toggleDraw() {
    isDrawingMode = !isDrawingMode;
    if (drawBtn) drawBtn.textContent = isDrawingMode ? "Stop Drawing" : "Draw (Freehand)";
    if (isDrawingMode) {
      if (drawOverlay) return;
      drawOverlay = WD.claim(document.createElement("div"));
      drawOverlay.style.cssText = "position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair; touch-action: none;";
      
      let currentPoints = [];
      let tempSvg = null;
      let tempPath = null;
      
      drawOverlay.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        currentPoints = [{x: e.clientX, y: e.clientY}];
        
        tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        tempSvg.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;";
        tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        tempPath.setAttribute("stroke", "#111");
        tempPath.setAttribute("stroke-width", "4");
        tempPath.setAttribute("fill", "none");
        tempPath.setAttribute("stroke-linecap", "round");
        tempPath.setAttribute("stroke-linejoin", "round");
        
        tempSvg.appendChild(tempPath);
        drawOverlay.appendChild(tempSvg);
        drawOverlay.setPointerCapture(e.pointerId);
      });
      
      drawOverlay.addEventListener("pointermove", (e) => {
        if (!currentPoints.length || !tempPath) return;
        
        const lastP = currentPoints[currentPoints.length - 1];
        const dx = e.clientX - lastP.x;
        const dy = e.clientY - lastP.y;
        if (dx * dx + dy * dy < 64) return; // 8px distance threshold for much smoother curves

        currentPoints.push({x: e.clientX, y: e.clientY});
        
        let d = `M ${currentPoints[0].x} ${currentPoints[0].y}`;
        for (let i = 1; i < currentPoints.length - 1; i++) {
          const xc = (currentPoints[i].x + currentPoints[i + 1].x) / 2;
          const yc = (currentPoints[i].y + currentPoints[i + 1].y) / 2;
          d += ` Q ${currentPoints[i].x} ${currentPoints[i].y}, ${xc} ${yc}`;
        }
        const last = currentPoints[currentPoints.length - 1];
        d += ` L ${last.x} ${last.y}`;
        tempPath.setAttribute("d", d);
      });
      
      drawOverlay.addEventListener("pointerup", (e) => {
        if (!currentPoints.length) return;
        drawOverlay.releasePointerCapture(e.pointerId);
        
        finalizeDrawing(currentPoints);
        
        if (tempSvg) tempSvg.remove();
        currentPoints = [];
        tempSvg = null;
        tempPath = null;
      });
      
      if (host) {
        document.body.insertBefore(drawOverlay, host);
      } else {
        document.body.appendChild(drawOverlay);
      }
    } else {
      stopDrawOverlay();
    }
  }

  function finalizeDrawing(points) {
    if (points.length < 2) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pagePoints = points.map(p => {
      const px = p.x + window.scrollX;
      const py = p.y + window.scrollY;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
      return {x: px, y: py};
    });
    
    const pad = 10;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 5 && h < 5) return; // skip tiny dots
    
    const wrap = document.createElement("div");
    wrap.classList.add("wd-added-drawing");
    WD.claim(wrap);
    wrap.classList.add(ADDED);
    wrap.style.width = w + "px";
    wrap.style.height = h + "px";
    wrap.style.left = minX + "px";
    wrap.style.top = minY + "px";
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.cssText = "width: 100%; height: 100%; display: block; overflow: visible;";
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke", "#111");
    path.setAttribute("stroke-width", "4");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.style.cssText = "pointer-events: stroke;";
    
    let d = `M ${pagePoints[0].x - minX} ${pagePoints[0].y - minY}`;
    for (let i = 1; i < pagePoints.length - 1; i++) {
      const xc = (pagePoints[i].x + pagePoints[i + 1].x) / 2 - minX;
      const yc = (pagePoints[i].y + pagePoints[i + 1].y) / 2 - minY;
      const px = pagePoints[i].x - minX;
      const py = pagePoints[i].y - minY;
      d += ` Q ${px} ${py}, ${xc} ${yc}`;
    }
    const last = pagePoints[pagePoints.length - 1];
    d += ` L ${last.x - minX} ${last.y - minY}`;
    
    path.setAttribute("d", d);
    svg.appendChild(path);
    wrap.appendChild(svg);
    
    addDeleteButton(wrap);
    addResizeHandle(wrap);
    makeDraggable(wrap);
    document.body.appendChild(wrap);
  }

  // --- Panel ----------------------------------------------------------------

  const TOGGLES = [
    { id: "wireframe", label: "Wireframes" },
    { id: "greek", label: "Grey bars" }
  ];

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function heading(text, hint) {
    const h = el("h2", null, text);
    if (hint) h.appendChild(el("span", "hint", " " + hint));
    return h;
  }

  function button(label, onClick) {
    const b = el("button", BTN, label);
    b.addEventListener("click", onClick);
    return b;
  }

  function createToolbar(state) {
    if (host) return;
    host = WD.claim(document.createElement("div"));
    // Closed: nothing in the page can reach in, not even via .shadowRoot.
    const root = host.attachShadow({ mode: "closed" });
    const sheet = document.createElement("style");
    sheet.textContent = PANEL_CSS;
    root.appendChild(sheet);

    panel = el("div", PANEL);

    const modes = el("section");
    modes.appendChild(heading("Modes"));
    for (const t of TOGGLES) {
      const row = el("div");
      row.style.display = "flex"; 
      row.style.alignItems = "center"; 
      row.style.gap = "8px"; 
      row.style.marginBottom = "6px";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!state[t.id];
      // The flag name lives on the element, so updateUI needs no parallel map.
      input.dataset.wdFlag = t.id;
      input.addEventListener("change", () => {
        try {
          chrome.runtime.sendMessage({
            type: "wwwire:updateState",
            state: { [t.id]: input.checked }
          });
        } catch (e) {
          /* worker asleep or context invalidated */
        }
      });
      row.appendChild(input);
      const span = el("span", null, t.label);
      span.style.pointerEvents = "none";
      span.style.userSelect = "none";
      span.style.webkitUserSelect = "none";
      row.appendChild(span);
      modes.appendChild(row);
    }

    const add = el("section");
    add.appendChild(heading("Add Element", "(Click to add)"));
    add.appendChild(button("Container", addContainer));
    add.appendChild(button("Text Box", addTextBox));
    
    drawBtn = button("Draw (Freehand)", toggleDraw);
    add.appendChild(drawBtn);

    panel.appendChild(modes);
    panel.appendChild(add);
    root.appendChild(panel);
    document.body.appendChild(host);
  }

  function updateUI(state) {
    if (!panel) return;
    panel.querySelectorAll("input[data-wd-flag]").forEach((i) => {
      i.checked = !!state[i.dataset.wdFlag];
    });
  }

  WD.register({
    name: "toolbar",
    // No flags of its own: the toolbar is chrome for whatever else is running,
    // so it asks the engine whether anything is active rather than naming
    // another module's flags.
    active: (s, self) => WD.anyActive(self),
    css: () => ADDED_CSS,
    mount(state) {
      createToolbar(state);
      window.addEventListener("pointerdown", onDocPointerDown, {
        capture: true,
        passive: true
      });
      window.addEventListener("keydown", onKeyDown);
    },
    update(state) {
      updateUI(state);
    },
    unmount() {
      window.removeEventListener("pointerdown", onDocPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      if (host) host.remove();
      stopDrawOverlay();
      host = null;
      panel = null;
      isDrawingMode = false;
      drawBtn = null;
    }
  });
})();
