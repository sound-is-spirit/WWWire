"""Verify the /simplify fixes: module contract, ownership, no toolbar stacking."""
import json, sys, time
from cdp import WS, http_json

BASE = "/Users/vesa.metsa-ketela/Code/WireDrafter/content/"
FILES = ["engine.js", "wireframe.js", "toolbar.js"]

ws = WS(http_json(9333, "/json/version")["webSocketDebuggerUrl"])
page = [t for t in ws.call("Target.getTargets", {"filter": [{}]})["targetInfos"]
        if t["type"] == "page" and "serp" in t["url"]][0]
s = ws.call("Target.attachToTarget", {"targetId": page["targetId"], "flatten": True})["sessionId"]


def ev(expr):
    r = ws.call("Runtime.evaluate",
                {"expression": expr, "returnByValue": True, "awaitPromise": True}, session=s)
    if "exceptionDetails" in r:
        d = r["exceptionDetails"]
        raise RuntimeError(str(d.get("exception", {}).get("description", ""))[:400])
    return r["result"].get("value")


results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" :: {detail}" if detail else ""))


ev("""
window.__roots = window.__roots || new Map();
window.__msgs = []; window.__sent = [];
window.chrome = {
  runtime: {
    onMessage: { addListener: f => window.__msgs.push(f) },
    sendMessage: m => window.__sent.push(m)
  },
  dom: { openOrClosedShadowRoot: el => window.__roots.get(el) || null }
};
window.__send = (state) =>
  window.__msgs.forEach(f => f({ type: 'wiredrafter:setState', state }));
'ok'""")

src = {f: open(BASE + f).read() for f in FILES}
for f in FILES:
    ev("(0,eval)(" + json.dumps(src[f]) + "), '" + f + "'")

print("-- module contract --")
check("two feature modules registered", ev("window.__WD.modules.length") == 2,
      ev("window.__WD.modules.map(m=>m.name).join(',')"))
check("engine exposes anyActive", ev("typeof window.__WD.anyActive") == "function")
check("engine exposes NOT_OWN selector", ev("window.__WD.NOT_OWN").startswith(":not("))
check("toolbar declares no foreign flags",
      ev("!window.__WD.modules.find(m=>m.name==='toolbar').flags"))

print("\n-- re-injection guard --")
for f in FILES:
    ev("(0,eval)(" + json.dumps(src[f]) + "), 'again'")
check("re-injection registers no extra modules", ev("window.__WD.modules.length") == 2,
      ev("window.__WD.modules.length"))

print("\n-- toolbar mount --")
ev("window.__send({wireframe:true, greek:true}), 'on'")
time.sleep(0.6)
check("toolbar mounted via anyActive", ev("document.querySelectorAll('.wd-toolbar').length") == 1,
      ev("document.querySelectorAll('.wd-toolbar').length"))
check("toolbar is claimed",
      ev("window.__WD.isOwnNode(document.querySelector('.wd-toolbar'))"))
check("toolbar styled from css() hook, not inline",
      ev("!document.querySelector('.wd-toolbar').getAttribute('style')"))
check("no !important in toolbar CSS",
      not any("!important" in l for l in src["toolbar.js"].splitlines()
              if not l.strip().startswith("//")))

print("\n-- toolbar does not stack --")
for _ in range(3):
    ev("window.__send({wireframe:true, greek:false}), 'x'")
    time.sleep(0.15)
    ev("window.__send({wireframe:true, greek:true}), 'x'")
    time.sleep(0.15)
check("still exactly one toolbar after 6 state pushes",
      ev("document.querySelectorAll('.wd-toolbar').length") == 1,
      ev("document.querySelectorAll('.wd-toolbar').length"))

print("\n-- ownership protects added elements --")
ev("""
 const b = document.createElement('div');
 window.__WD.claim(b); b.className = 'wd-added'; b.style.cssText='position:absolute;width:200px;height:200px';
 b.id = 'probe-added';
 const t = document.createElement('div');
 t.className = 'wd-text-inner'; t.textContent = 'user typed this';
 b.appendChild(t);
 document.body.appendChild(b);
 window.__WD.invalidate(); 'added'""")
time.sleep(0.4)
ev("window.__send({wireframe:true, greek:true}), 'repaint'")
time.sleep(0.5)
check("added box not tagged as page structure",
      ev("!document.getElementById('probe-added').classList.contains('wd-box')"))
check("text inside added box not greeked",
      ev("!document.querySelector('#probe-added .wd-text-inner').classList.contains('wd-text')"))
check("contenteditable-generated child also protected",
      ev("""(() => {
        const d = document.createElement('div');
        d.textContent = 'line two';
        document.querySelector('#probe-added .wd-text-inner').appendChild(d);
        return window.__WD.isOwnNode(d);
      })()"""))
css = ev("document.querySelector('style[data-wiredrafter]').textContent")
check("media rule now carries the ownership exclusion",
      "img:not([data-wiredrafter]" in css)

print("\n-- teardown --")
ev("document.getElementById('probe-added').remove(); 'rm'")
ev("window.__send({wireframe:false, greek:false}), 'off'")
time.sleep(0.5)
check("toolbar unmounts", ev("document.querySelectorAll('.wd-toolbar').length") == 0)
check("no extension nodes left", ev("document.querySelectorAll('[data-wiredrafter]').length") == 0,
      ev("document.querySelectorAll('[data-wiredrafter]').length"))

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
