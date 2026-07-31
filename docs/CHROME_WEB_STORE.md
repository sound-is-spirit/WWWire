# Chrome Web Store submission guide

Everything you need to paste into the CWS Developer Dashboard.

## 1. Package the extension

The store wants a ZIP of the extension **contents** (manifest at the root).

```bash
cd Page-GreyOut
zip -r page-greyout-2.1.0.zip \
  manifest.json background.js content_isolated.js schema.json icons \
  -x "*.DS_Store"
```

An allowlist is safer than an exclude list: nothing new can leak into the
package later just because it wasn't in the `-x` list.

Ship only what the extension needs: `manifest.json`, `background.js`,
`content_isolated.js`, `schema.json`, `icons/`. (Docs/licence can stay in the
GitHub repo; they don't need to be in the CRX.)

## 2. Store listing fields

- **Name:** Page GreyOut
- **Summary (132 char max):**
  `Masks all on-screen text with grey blocks for safe screen sharing, demos and screenshots. Works on any page.`
- **Category:** Productivity
- **Screenshots:** ready to upload, in `store/`:
  1. `store/screenshot-1-before.png` — normal page
  2. `store/screenshot-2-after.png` — same page redacted

  Both are 1280×800 PNG, RGB, no alpha channel (CWS rejects transparency).
  Generated from `docs/example-*.png` by scaling 1920×1080 → 1280×720 and
  padding the bottom with the page background colour.

  Screenshots are uploaded through the dashboard, **not** placed in the ZIP.
  Upload them in this order; the first is the listing's hero image.
- **Description:** see below.

### Long description

```
Page GreyOut instantly redacts every piece of on-screen text into clean grey
blocks — perfect for screen sharing, live demos, documentation and screenshots
where you don't want names, numbers, emails or other data on display.

Click the toolbar icon (or press Ctrl/Cmd+Shift+Y) to turn it on; click again to
reveal. It works on any website, including single-page apps and content inside
web-component (Shadow DOM) controls.

How it's different:
• Universal — a single rendering rule greys ALL text, so nothing is missed.
• No layout shift — text keeps its exact size and wrapping.
• Private by design — zero network requests, zero data collection, no remote code.

Note: this is a visual privacy tool for screen sharing. The underlying text still
exists in the page; it is not a data-security or encryption control.
```

## 3. Privacy tab (required)

- **Data collection:** "This item does not collect or use your data." (True — the
  only stored value is the local on/off toggle.)
- **Single purpose:** "Visually redact on-screen text with grey blocks for privacy
  during screen sharing."
- **Privacy policy URL:**
  `https://github.com/sound-is-spirit/Page-GreyOut/blob/main/PRIVACY.md`
  (CWS accepts a public GitHub URL; it just has to resolve without a login.)

### Permission justifications (paste verbatim)

- **`storage`:**
  "Stores a single boolean — whether redaction is currently on or off — so the
  choice persists across page loads and browser restarts."

- **`<all_urls>` host permission:**
  "This extension provides continuous screen-sharing redaction. To ensure a user
  does not accidentally navigate to a sensitive page containing personal data
  while actively screen sharing, the redaction must apply persistently across all
  navigations and all URLs while it is switched on. The `activeTab` permission is
  functionally insufficient because its access is dropped on cross-origin
  navigation, which would expose data mid-presentation. No page data is collected
  or transmitted; the host access is used solely to inject a local CSS overlay."

## 4. Pre-submission checklist (CWS rejection codes)

- [ ] **Blue Argon (remote code):** none — fonts are Base64, no `eval`/remote imports.
- [ ] **Red Magnesium (single purpose):** one function only (text redaction).
- [ ] **Yellow Magnesium (packaging):** every file in `manifest.json` exists in the
      ZIP with exact case (`icons/bar16.png`, `bar32`, `bar48`, `bar128`).
- [ ] **Purple Potassium (excess permissions):** `<all_urls>` justified above;
      `scripting`/`tabs`/`cookies` are NOT requested.
- [ ] **Yellow Zinc (listing):** accurate description, no keyword stuffing, 1280×800
      screenshots attached.
