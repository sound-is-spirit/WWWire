// WireDrafter - floating toolbar.
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
//   2. Styling lives in the css() hook, not in inline cssText. The engine
//      already concatenates module CSS and mirrors it into every root, and a
//      stylesheet rule needs no !important to beat nothing.

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

  let panel = null;

  // --- Styles ---------------------------------------------------------------
  // Scoped under [data-wiredrafter], which the engine stamps via WD.claim, so
  // these rules can never touch the host page.

  const CSS = `
.${PANEL} {
  position: fixed; top: 20px; right: 20px; z-index: 2147483647;
  width: 150px; padding: 12px; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 12px;
  background: #fff; border: 2px solid #111; color: #111;
  font: 14px/1.4 system-ui, sans-serif;
}
.${PANEL} h2 { font-size: 14px; font-weight: 700; margin: 0 0 8px; }
.${PANEL} label {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 6px; cursor: pointer;
}
.${PANEL} section + section { border-top: 1px solid #ddd; padding-top: 12px; }
.${PANEL} .hint { font-weight: 400; font-size: 0.85em; color: #666; }
.${BTN} {
  display: block; width: 100%; padding: 6px; margin-bottom: 6px;
  background: #111; color: #fff; border: 1px solid #111;
  font: 700 14px/1.2 system-ui, sans-serif; text-align: center; cursor: pointer;
}
.${BTN}:last-child { margin-bottom: 0; }

.${ADDED} {
  position: absolute; z-index: 2147483646;
  box-sizing: border-box; resize: both; overflow: hidden;
  background: rgba(0, 0, 0, 0.05); cursor: move;
}
.${ADDED}:not(.${TEXT}) { outline: 1px solid #111; }
.${TEXT} { padding: 8px; border: 1px dashed #666; }
.${INNER} {
  width: 100%; height: 100%; min-height: 20px; outline: none;
  color: #111; caret-color: #0a84ff;
}
.${DEL} {
  position: absolute; top: 0; right: 0; width: 24px; height: 24px;
  background: #ff3b30; color: #fff; border-radius: 0 0 0 4px;
  font: 700 16px/24px system-ui, sans-serif; text-align: center;
  cursor: pointer; z-index: 2147483647;
}
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
      el.remove();
    });
    el.appendChild(btn);
  }

  function makeDraggable(el) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let baseLeft = 0;
    let baseTop = 0;
    let frame = 0;
    let pending = null;

    function flush() {
      frame = 0;
      if (!pending) return;
      el.style.left = pending.x + "px";
      el.style.top = pending.y + "px";
      pending = null;
    }

    function onMove(e) {
      pending = {
        x: baseLeft + (e.clientX - startX),
        y: baseTop + (e.clientY - startY)
      };
      // Coalesce to one write per frame rather than one per event.
      if (!frame) frame = requestAnimationFrame(flush);
    }

    function stop(e) {
      if (pointerId === null) return;
      const moved =
        Math.abs(e.clientX - startX) > 2 || Math.abs(e.clientY - startY) > 2;
      try {
        el.releasePointerCapture(pointerId);
      } catch (err) {
        // Already released, e.g. the gesture was cancelled. Throwing here would
        // abort the rest of this handler and the click-to-edit below with it.
      }
      pointerId = null;
      if (frame) {
        cancelAnimationFrame(frame);
        flush();
      }
      // Listeners live only for the duration of a drag: 20 added boxes would
      // otherwise keep 40 idle pointer listeners firing on every mouse move.
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
      el.style.removeProperty("will-change");

      if (!moved && el.classList.contains(TEXT)) {
        const inner = el.querySelector("." + INNER);
        if (inner) {
          inner.setAttribute("contenteditable", "true");
          inner.focus();
        }
      }
    }

    el.addEventListener("pointerdown", (e) => {
      if (e.target.dataset && e.target.dataset.wdDelete) return;
      // isContentEditable is the computed, inherited property, so it is already
      // true for every node inside an editable region. It also covers
      // contenteditable="" and "plaintext-only", which an attribute selector
      // would miss.
      if (e.target.isContentEditable) return;
      // The native resize gripper lives outside the content box.
      if (e.offsetX > el.clientWidth || e.offsetY > el.clientHeight) return;

      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      baseLeft = parseFloat(el.style.left) || 0;
      baseTop = parseFloat(el.style.top) || 0;
      el.setPointerCapture(pointerId);
      el.style.willChange = "left, top";
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", stop);
      el.addEventListener("pointercancel", stop);
      e.stopPropagation();
      e.preventDefault();
    });
  }

  // Claimed at creation, so the engine's observer skips the insertion and no
  // rescan is scheduled: an absolutely-positioned box we own changes nothing
  // about how the page's own elements should be tagged.
  function spawn(el, w, h) {
    WD.claim(el);
    el.classList.add(ADDED);
    el.style.width = w + "px";
    el.style.left = window.scrollX + window.innerWidth / 2 - w / 2 + "px";
    el.style.top = window.scrollY + window.innerHeight / 2 - h / 2 + "px";
    addDeleteButton(el);
    makeDraggable(el);
    document.body.appendChild(el);
  }

  function addContainer() {
    const box = document.createElement("div");
    box.style.height = "200px";
    spawn(box, 200, 200);
  }

  function addTextBox() {
    const wrap = document.createElement("div");
    wrap.classList.add(TEXT);
    wrap.style.minHeight = "24px";
    const inner = document.createElement("div");
    inner.className = INNER;
    inner.textContent = "New Text Box";
    inner.addEventListener("blur", () => inner.removeAttribute("contenteditable"));
    wrap.appendChild(inner);
    spawn(wrap, 200, 40);
  }

  // --- Panel ----------------------------------------------------------------

  const TOGGLES = [
    { id: "wireframe", label: "Wireframe" },
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
    if (panel) return;
    panel = WD.claim(el("div", PANEL));

    const modes = el("section");
    modes.appendChild(heading("Modes"));
    for (const t of TOGGLES) {
      const label = el("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!state[t.id];
      // The flag name lives on the element, so updateUI needs no parallel map.
      input.dataset.wdFlag = t.id;
      input.addEventListener("change", () => {
        try {
          chrome.runtime.sendMessage({
            type: "wiredrafter:updateState",
            state: { [t.id]: input.checked }
          });
        } catch (e) {
          /* worker asleep or context invalidated */
        }
      });
      label.appendChild(input);
      label.appendChild(el("span", null, t.label));
      modes.appendChild(label);
    }

    const add = el("section");
    add.appendChild(heading("Add Element", "(Click to add)"));
    add.appendChild(button("Container", addContainer));
    add.appendChild(button("Text Box", addTextBox));

    panel.appendChild(modes);
    panel.appendChild(add);
    document.body.appendChild(panel);
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
    css: () => CSS,
    mount(state) {
      createToolbar(state);
    },
    update(state) {
      updateUI(state);
    },
    unmount() {
      if (panel) panel.remove();
      panel = null;
    }
  });
})();
