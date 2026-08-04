"""Drive the real toolbar with real input events: spawn, drag, resize, delete.

The panel is behind a closed shadow root, so synthetic DOM events cannot reach
it. Input.dispatchMouseEvent goes through Chrome's real input pipeline, which
does cross the boundary, exactly as a user's mouse does.
"""
import json, sys, time
from cdp import WS, http_json

BASE = "/Users/vesa.metsa-ketela/Code/WWWire/content/"
ws = WS(http_json(9333, "/json/version")["webSocketDebuggerUrl"])
page = [t for t in ws.call("Target.getTargets", {"filter": [{}]})["targetInfos"]
        if t["type"] == "page" and "feed" in t["url"]][0]
s = ws.call("Target.attachToTarget", {"targetId": page["targetId"], "flatten": True})["sessionId"]

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" :: {detail}" if detail else ""))


def ev(expr):
    r = ws.call("Runtime.evaluate",
                {"expression": expr, "returnByValue": True, "awaitPromise": True}, session=s)
    if "exceptionDetails" in r:
        raise RuntimeError(str(r["exceptionDetails"].get("exception", {}).get("description"))[:300])
    return r["result"].get("value")


def mouse(kind, x, y):
    ws.call("Input.dispatchMouseEvent", {
        "type": kind, "x": x, "y": y, "button": "left",
        "clickCount": 1 if kind != "mouseMoved" else 0,
        "buttons": 1 if kind in ("mousePressed", "mouseMoved") else 0
    }, session=s)


def click(x, y):
    mouse("mousePressed", x, y)
    time.sleep(0.04)
    mouse("mouseReleased", x, y)
    time.sleep(0.12)


def drag(x0, y0, x1, y1):
    mouse("mousePressed", x0, y0)
    time.sleep(0.05)
    steps = 6
    for i in range(1, steps + 1):
        mouse("mouseMoved", x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
        time.sleep(0.03)
    mouse("mouseReleased", x1, y1)
    time.sleep(0.2)


ev("""
window.__roots = window.__roots || new Map();
window.__msgs = [];
window.chrome = {
  runtime: { onMessage: { addListener: f => window.__msgs.push(f) }, sendMessage: () => {} },
  dom: { openOrClosedShadowRoot: el => window.__roots.get(el) || null }
};
window.__send = st => window.__msgs.forEach(f => f({ type: 'wwwire:setState', state: st }));
'ok'""")
for f in ["engine.js", "wireframe.js", "toolbar.js"]:
    ev("(0,eval)(" + json.dumps(open(BASE + f).read()) + "), 'x'")
ev("window.__send({wireframe:true, greek:true}), 'on'")
time.sleep(0.8)

W = ev("innerWidth")
bx = W - 95  # panel is fixed, 150 wide, 20 from the right

print("-- spawn a Container via the real toolbar button --")
found = None
for y in range(140, 260, 4):
    click(bx, y)
    if ev("document.querySelectorAll('.wd-added').length") > 0:
        found = y
        break
check("clicking Container adds one element", found is not None, f"button at y={found}")
if found is None:
    print(f"\n{sum(results)}/{len(results)} passed")
    sys.exit(1)
check("only one element added", ev("document.querySelectorAll('.wd-added').length") == 1)
check("added element is claimed", ev("__WD.isOwnNode(document.querySelector('.wd-added'))"))

box = ev("(()=>{const r=document.querySelector('.wd-added').getBoundingClientRect();"
         "return {x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom}})()")
print(f"   box: {box['w']:.0f}x{box['h']:.0f} at ({box['x']:.0f},{box['y']:.0f})")

print("\n-- black and white --")
st = ev("(()=>{const e=document.querySelector('.wd-added');const c=getComputedStyle(e);"
        "return {bg:c.backgroundColor, bc:c.borderTopColor, bw:c.borderTopWidth}})()")
check("white fill, not a grey wash", st["bg"] == "rgb(255, 255, 255)", st["bg"])
check("black border", st["bc"] in ("rgb(17, 17, 17)", "rgb(0, 0, 0)"), st["bc"])

print("\n-- handles hide until hover or selection --")
vis = "(s)=>getComputedStyle(document.querySelector(s)).display"
mouse("mouseMoved", 5, 5)  # park the pointer well away
time.sleep(0.2)
check("delete button hidden when idle", ev(f"({vis})('.wd-del')") == "none",
      ev(f"({vis})('.wd-del')"))
check("gripper hidden when idle", ev(f"({vis})('.wd-grip')") == "none")
mouse("mouseMoved", box["x"] + box["w"] / 2, box["y"] + box["h"] / 2)
time.sleep(0.25)
check("both appear on hover",
      ev(f"({vis})('.wd-del')") != "none" and ev(f"({vis})('.wd-grip')") != "none")

print("\n-- resize from the corner --")
drag(box["r"] - 6, box["b"] - 6, box["r"] + 70, box["b"] + 50)
check("element is selected after a gesture",
      ev("document.querySelector('.wd-added').classList.contains('wd-sel')"))
after = ev("(()=>{const r=document.querySelector('.wd-added').getBoundingClientRect();"
           "return {w:r.width,h:r.height,x:r.x,y:r.y}})()")
check("width grew", after["w"] > box["w"] + 40, f'{box["w"]:.0f} -> {after["w"]:.0f}')
check("height grew", after["h"] > box["h"] + 25, f'{box["h"]:.0f} -> {after["h"]:.0f}')
check("resize did not also move it", abs(after["x"] - box["x"]) < 3 and abs(after["y"] - box["y"]) < 3,
      f'moved {after["x"]-box["x"]:.0f},{after["y"]-box["y"]:.0f}')

print("\n-- drag from the middle --")
mid_x = after["x"] + after["w"] / 2
mid_y = after["y"] + after["h"] / 2
drag(mid_x, mid_y, mid_x - 120, mid_y + 60)
moved = ev("(()=>{const r=document.querySelector('.wd-added').getBoundingClientRect();"
           "return {x:r.x,y:r.y,w:r.width,h:r.height}})()")
check("moved left", moved["x"] < after["x"] - 90, f'{after["x"]:.0f} -> {moved["x"]:.0f}')
check("moved down", moved["y"] > after["y"] + 40, f'{after["y"]:.0f} -> {moved["y"]:.0f}')
check("drag did not resize it", abs(moved["w"] - after["w"]) < 3 and abs(moved["h"] - after["h"]) < 3)

print("\n-- selection survives the pointer leaving --")
mouse("mouseMoved", 5, 5)
time.sleep(0.25)
check("handles stay visible while selected", ev(f"({vis})('.wd-grip')") != "none",
      ev(f"({vis})('.wd-grip')"))
click(5, 5)
time.sleep(0.2)
check("clicking the page deselects", 
      not ev("document.querySelector('.wd-added').classList.contains('wd-sel')"))
check("handles hidden again after deselect", ev(f"({vis})('.wd-grip')") == "none")

print("\n-- delete button --")
mouse("mouseMoved", moved["x"] + moved["w"] / 2, moved["y"] + moved["h"] / 2)
time.sleep(0.2)
click(moved["x"] + moved["w"] - 11, moved["y"] + 11)
check("delete button removes the element", ev("document.querySelectorAll('.wd-added').length") == 0)

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
