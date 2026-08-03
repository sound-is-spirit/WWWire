// WireDrafter — background service worker (Manifest V3)
//
// Owns all state. The content script is a dumb renderer that does what this
// worker tells it.
//
// Permission model: `activeTab` + `scripting`, NOT `<all_urls>`. The content
// script is not declared in the manifest; it is injected only into the tab the
// user explicitly invoked the extension on (toolbar click or keyboard command,
// both of which grant activeTab for that tab). Consequences:
//   - The install prompt no longer asks to "read and change all your data on
//     all websites".
//   - Nothing runs anywhere until the user asks for it.
//   - State is inherently PER TAB, which is what a wireframing tool wants.
//     Toggling in one tab no longer flips every other tab and iframe.
//   - Draft mode does not survive a navigation or reload. The injected script
//     dies with the document, so we clear the tab's state to match.
//
// State lives in chrome.storage.session (in-memory, cleared when the browser
// closes) keyed by tab id, not chrome.storage.local. Persisting "draft mode is
// on" across a browser restart would be wrong: you would relaunch into a state
// whose renderer no longer exists.

const MSG_SET_STATE = "wiredrafter:setState";
const TAB_KEY_PREFIX = "tab:";

const tabKey = (tabId) => TAB_KEY_PREFIX + tabId;

// --- Per-tab state ---------------------------------------------------------

async function isTabEnabled(tabId) {
  try {
    const k = tabKey(tabId);
    const res = await chrome.storage.session.get(k);
    return res[k] === true;
  } catch (e) {
    return false;
  }
}

async function setTabEnabled(tabId, enabled) {
  try {
    if (enabled) await chrome.storage.session.set({ [tabKey(tabId)]: true });
    else await chrome.storage.session.remove(tabKey(tabId));
  } catch (e) {
    /* session storage unavailable; state degrades to per-invocation */
  }
}

// --- Toolbar icon ----------------------------------------------------------
//
// The icon is now per tab. OFF is the plain packaged icon; ON overlays a green
// chip. So "this tab looks different" reads directly as "this tab is drafted",
// which the old global ON/OFF chip could not express once state went per-tab.

function makeOnIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const mx = Math.max(1, Math.round(size * 0.02));
  const boxH = Math.round(size * 0.72);
  const boxY = Math.round((size - boxH) / 2);
  const boxW = size - 2 * mx;
  ctx.fillStyle = "#34a853";
  ctx.fillRect(mx, boxY, boxW, boxH);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fs = Math.round(boxH * 0.74);
  for (; fs > 4; fs--) {
    ctx.font = "bold " + fs + "px Arial, Helvetica, sans-serif";
    if (ctx.measureText("ON").width <= boxW * 0.84) break;
  }
  ctx.font = "bold " + fs + "px Arial, Helvetica, sans-serif";
  ctx.fillText("ON", size / 2, Math.round(size / 2 + size * 0.04));

  return ctx.getImageData(0, 0, size, size);
}

const DEFAULT_ICON_PATHS = {
  16: "icons/bar16.png",
  32: "icons/bar32.png",
  48: "icons/bar48.png",
  128: "icons/bar128.png"
};

async function refreshIcon(tabId, enabled) {
  try {
    if (enabled) {
      await chrome.action.setIcon({
        tabId,
        imageData: { 16: makeOnIcon(16), 32: makeOnIcon(32), 48: makeOnIcon(48) }
      });
    } else {
      // Passing the packaged paths for this tab resets it to the default look.
      await chrome.action.setIcon({ tabId, path: DEFAULT_ICON_PATHS });
    }
  } catch (e) {
    /* tab closed mid-update, or action unavailable during startup */
  }
  try {
    await chrome.action.setTitle({
      tabId,
      title: enabled
        ? "WireDrafter: ON for this tab (click to turn off)"
        : "WireDrafter: click to draft this tab"
    });
  } catch (e) {
    /* ignore */
  }
}

// --- Injection -------------------------------------------------------------

// Always inject before messaging. The content script guards against re-running,
// so this is cheap and removes any need to track which frames are already live
// (a tab can navigate, or the worker can restart, at any time).
async function injectInto(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content_isolated.js"]
  });
}

async function pushState(tabId, enabled) {
  await injectInto(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG_SET_STATE, enabled });
  } catch (e) {
    // Some frames legitimately have no listener (about:blank, sandboxed docs).
    // The injection above is what matters; a missing responder is not fatal.
  }
}

async function signalBlocked(tabId) {
  try {
    await chrome.action.setTitle({
      tabId,
      title: "WireDrafter can't run on this page (Chrome restricts it)"
    });
    await chrome.action.setBadgeText({ tabId, text: "!" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#5f6368" });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    }, 2000);
  } catch (e) {
    /* ignore */
  }
}

async function toggleTab(tabId) {
  const next = !(await isTabEnabled(tabId));
  try {
    await pushState(tabId, next);
  } catch (e) {
    // executeScript throws on pages Chrome forbids scripting: chrome://,
    // the Web Store, other extensions' pages, the New Tab page.
    await signalBlocked(tabId);
    return;
  }
  await setTabEnabled(tabId, next);
  await refreshIcon(tabId, next);
}

// --- Lifecycle -------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  // Drop the global on/off flag inherited from GreyOut. State is per-tab now,
  // and leaving a stale key in local storage would be misleading.
  try {
    await chrome.storage.local.remove("enabled");
  } catch (e) {
    /* ignore */
  }
});

// A navigation destroys the injected script, so the tab is no longer drafted.
// Clear the flag and the icon rather than lying about the state.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "loading") return;
  if (!(await isTabEnabled(tabId))) return;
  await setTabEnabled(tabId, false);
  await refreshIcon(tabId, false);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  setTabEnabled(tabId, false);
});

// Keyboard shortcut. Triggering a registered command grants activeTab for the
// active tab, which is what makes the injection below permitted.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-draft") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) await toggleTab(tab.id);
});

// Primary interaction: no popup yet (there is only one mode to toggle), so a
// toolbar click toggles the active tab directly. The popup arrives with the
// wireframe/edit mode switches.
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) toggleTab(tab.id);
});
