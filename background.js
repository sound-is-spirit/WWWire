// GreyOut — background service worker (Manifest V3)
//
// Responsibilities:
//   1. Persist the default toggle state in chrome.storage.local.
//   2. Toggle state on the toolbar icon click and the keyboard command.
//   3. Draw the toolbar icon so it reads "OFF" / "ON" inside a grey box.
//
// All redaction (light DOM AND Shadow DOM) happens in content_isolated.js,
// entirely within the ISOLATED world — no MAIN-world injection, so this worker
// needs no "scripting" permission and never touches the host page's runtime.

// Default OFF: since the extension runs on every site, leaving it ON by default
// would grey out the entire web on install. The user clicks the icon (or
// Ctrl/Cmd+Shift+Y) to redact the page they are about to share.
const DEFAULT_STATE = { enabled: false };

// Draw a grey box containing "OFF" or "ON" text at the given pixel size, using
// an OffscreenCanvas (available in MV3 service workers). Returns ImageData for
// chrome.action.setIcon — no separate badge needed.
function makeStateIcon(text, size) {
  const on = text === "ON";
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  // Sharp-edged chip: green when ON, slate grey when OFF, with a crisp white
  // label sized to fill the box.
  const mx = Math.max(1, Math.round(size * 0.02));
  const boxH = Math.round(size * 0.72);
  const boxY = Math.round((size - boxH) / 2);
  const boxW = size - 2 * mx;
  ctx.fillStyle = on ? "#34a853" : "#5f6368"; // green / slate grey
  ctx.fillRect(mx, boxY, boxW, boxH);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fs = Math.round(boxH * 0.74);
  for (; fs > 4; fs--) {
    ctx.font = "bold " + fs + "px Arial, Helvetica, sans-serif";
    if (ctx.measureText(text).width <= boxW * 0.84) break;
  }
  ctx.font = "bold " + fs + "px Arial, Helvetica, sans-serif";
  ctx.fillText(text, size / 2, Math.round(size / 2 + size * 0.04));

  return ctx.getImageData(0, 0, size, size);
}

async function refreshIcon(enabled) {
  const text = enabled ? "ON" : "OFF";
  try {
    await chrome.action.setIcon({
      imageData: {
        16: makeStateIcon(text, 16),
        32: makeStateIcon(text, 32),
        48: makeStateIcon(text, 48)
      }
    });
  } catch (e) {
    /* action/canvas may be unavailable very early in startup */
  }
  // No separate badge — the state lives in the icon. Clear any legacy badge.
  try {
    await chrome.action.setBadgeText({ text: "" });
  } catch (e) {
    /* ignore */
  }
  try {
    await chrome.action.setTitle({
      title: enabled
        ? "GreyOut — ON (click to disable)"
        : "GreyOut — OFF (click to enable)"
    });
  } catch (e) {
    /* ignore */
  }
}

async function toggleState() {
  const { enabled } = await chrome.storage.local.get(DEFAULT_STATE);
  await chrome.storage.local.set({ enabled: !enabled });
}

// --- Lifecycle -------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(DEFAULT_STATE);
  // Preserve an existing explicit ON across updates; fresh install => OFF.
  const enabled = stored.enabled === true;
  await chrome.storage.local.set({ enabled });
  await refreshIcon(enabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const { enabled } = await chrome.storage.local.get(DEFAULT_STATE);
  await refreshIcon(enabled === true);
});

// Keep the icon in sync whenever state changes (icon click, command, etc.).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) {
    refreshIcon(changes.enabled.newValue === true);
  }
});

// Keyboard shortcut (Ctrl/Cmd+Shift+Y by default).
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-anonymizer") toggleState();
});

// Primary interaction: there is no popup, so clicking the toolbar icon toggles
// the state directly (ON -> OFF -> ON). The icon itself shows OFF / ON.
chrome.action.onClicked.addListener(() => {
  toggleState();
});
