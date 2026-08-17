// WWWire - background service worker (Manifest V3)
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

const MSG_SET_STATE = "wwwire:setState";
const TAB_KEY_PREFIX = "tab:";

const tabKey = (tabId) => TAB_KEY_PREFIX + tabId;

// Turning everything ON is the only state the worker has to spell out. OFF is
// `{}`: the engine fills every registered module's declared default (all false)
// via WD.apply, so the worker needs no vocabulary for it and a new module lands
// without editing this file.
const ON_STATE = { wireframe: true, greek: true };
const OFF_STATE = {};

// Derived, not enumerated, so this keeps working when a module adds a flag.
const isOn = (s) => !!s && Object.values(s).some(Boolean);

// --- Per-tab state ---------------------------------------------------------

async function getTabState(tabId) {
  try {
    const k = tabKey(tabId);
    const res = await chrome.storage.session.get(k);
    if (res[k] && typeof res[k] === "object") return res[k];
  } catch (e) {
    /* ignore */
  }
  return Object.assign({}, OFF_STATE);
}

async function setTabState(tabId, stateObj) {
  try {
    if (isOn(stateObj)) {
      await chrome.storage.session.set({ [tabKey(tabId)]: stateObj });
    } else {
      await chrome.storage.session.remove(tabKey(tabId));
    }
  } catch (e) {
    /* session storage unavailable; state degrades to per-invocation */
  }
}

async function isTabEnabled(tabId) {
  return isOn(await getTabState(tabId));
}

// --- Toolbar icon ----------------------------------------------------------
//
// The icon is now per tab. OFF is the plain packaged icon; ON overlays a green
// chip. So "this tab looks different" reads directly as "this tab is drafted",
// which the old global ON/OFF chip could not express once state went per-tab.

const ACTIVE_ICON_PATHS = {
  16: "icons/bar16-active.png",
  32: "icons/bar32-active.png",
  48: "icons/bar48-active.png",
  128: "icons/bar128-active.png"
};

const INACTIVE_ICON_PATHS = {
  16: "icons/bar16-V2.png",
  32: "icons/bar32-V2.png",
  48: "icons/bar48-V2.png",
  128: "icons/bar128-V2.png"
};

async function refreshIcon(tabId, enabled) {
  const icon = enabled
    ? { tabId, path: ACTIVE_ICON_PATHS }
    : { tabId, path: INACTIVE_ICON_PATHS };
  
  const title = enabled
    ? "WWWire: ON for this tab (click to turn off)"
    : "WWWire: click to draft this tab";
    
  // Independent calls, so they overlap instead of serialising.
  await Promise.all([
    chrome.action.setIcon(icon).catch(() => {}),
    chrome.action.setTitle({ tabId, title }).catch(() => {})
  ]);
}

// --- Injection -------------------------------------------------------------

// Always inject before messaging. The content script guards against re-running,
// so this is cheap and removes any need to track which frames are already live
// (a tab can navigate, or the worker can restart, at any time).
// Order matters: engine.js defines window.__WD, and every feature module bails
// out immediately if it is missing.
const CONTENT_FILES = ["content/engine.js", "content/wireframe.js", "content/toolbar.js"];

async function injectInto(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: CONTENT_FILES
  });
}

async function pushState(tabId, stateObj, { inject = true } = {}) {
  // Injection is idempotent but not free: it re-executes every content file in
  // every frame. Only the OFF -> ON edge actually needs it; a message that
  // arrived from a content script proves one is already running.
  if (inject) await injectInto(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MSG_SET_STATE,
      state: stateObj
    });
  } catch (e) {
    // Some frames legitimately have no listener (about:blank, sandboxed docs).
    // The injection above is what matters; a missing responder is not fatal.
  }
}

async function signalBlocked(tabId) {
  try {
    await chrome.action.setTitle({
      tabId,
      title: "WWWire can't run on this page (Chrome restricts it)"
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

// Persist and reflect a state that has already been pushed to the page.
async function applyTabState(tabId, stateObj) {
  await Promise.all([
    setTabState(tabId, stateObj),
    refreshIcon(tabId, isOn(stateObj))
  ]);
}

async function toggleTab(tabId) {
  const next = (await isTabEnabled(tabId)) ? OFF_STATE : ON_STATE;
  try {
    await pushState(tabId, next);
  } catch (e) {
    // executeScript throws on pages Chrome forbids scripting: chrome://,
    // the Web Store, other extensions' pages, the New Tab page.
    await signalBlocked(tabId);
    return;
  }
  await applyTabState(tabId, next);
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
  await applyTabState(tabId, OFF_STATE);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  setTabState(tabId, OFF_STATE);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-draft") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) await toggleTab(tab.id);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id != null) await toggleTab(tab.id);
});

// Messages from the in-page toolbar. Writes are serialised per tab: two quick
// checkbox clicks would otherwise both read the same snapshot and the second
// would resurrect the flag the first cleared.
const pending = new Map();

function serialize(tabId, fn) {
  const next = (pending.get(tabId) || Promise.resolve()).then(fn, fn);
  pending.set(tabId, next.finally(() => {
    if (pending.get(tabId) === next) pending.delete(tabId);
  }));
  return next;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "wwwire:updateState") return;
  // The sender's own tab id is authoritative; never trust a caller-supplied one.
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;

  serialize(tabId, async () => {
    const merged = Object.assign(await getTabState(tabId), msg.state);
    try {
      // No injection: this message came from a live content script.
      await pushState(tabId, merged, { inject: false });
      await applyTabState(tabId, merged);
      sendResponse({ success: true });
    } catch (e) {
      await signalBlocked(tabId);
      sendResponse({ success: false });
    }
  });
  return true; // async
});
