# Chrome Web Store Listing: WebWire

> Last Updated: 2026-08-04
>
> Everything here must describe the build actually being uploaded. Reviewers
> check the listing against the package, and a listing that promises features
> the ZIP does not contain, or names a file that is not in it, is a rejection.

## Store Listing

**Extension Name** [REQUIRED]
WebWire - Live Website Wireframes

**Short Description** [REQUIRED]
Turn any website into a lo-fi wireframe, then sketch on top of it with your own freehand drawings, containers, and text boxes.

**Detailed Description** [REQUIRED]
WebWire strips a live website down to its structure so you can see the layout instead of the design.

What it does:
- Wireframe mode flattens the page to a high-contrast blueprint: white surfaces, black type, decoration removed, images and video collapsed to flat grey plates, and hand-drawn sketch outlines around the structural elements.
- Grey bars replace the text with bars sized to the real copy, so you read rhythm and hierarchy instead of words. Headings stay heavier, so the hierarchy survives.
- A floating toolbar lets you add your own containers, text boxes, and freehand drawings on top of the wireframe. 
- Full keyboard support: Drag, resize, or delete elements with Backspace/Delete. Copy and paste them with Cmd+C/Cmd+V, and reverse any mistakes with the Cmd+Z Undo stack.

Useful for exploring how an existing page is put together, presenting a simplified layout to stakeholders, or sketching a change directly over the real thing before anyone opens a design tool.

Note: WebWire adds and edits its own elements. It does not move or delete the website's own content. Everything is temporary and lives only in the tab you turned it on in; reloading the page restores it completely.

Privacy: WebWire runs entirely on your device. It makes no network requests of any kind, collects nothing, and does nothing at all until you click the icon on a specific tab.

**Category** [REQUIRED]
Developer Tools

**Single Purpose** [REQUIRED]
Renders a live web page as a lo-fi wireframe and lets the user draw and sketch additional layout elements on top of it.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128x128 PNG | Ready | icons/bar128.png |
| Screenshot 1 [REQUIRED] | 1280x800 or 640x400 | Not created | |
| Screenshot 2 [RECOMMENDED] | 1280x800 or 640x400 | Not created | |
| Screenshot 3 [RECOMMENDED] | 1280x800 or 640x400 | Not created | |
| Small Promo Tile [RECOMMENDED] | 440x280 | Not created | |
| Marquee Promo Tile | 1400x560 | Not created | |

### Screenshot Notes
All three are buildable against the current build:
- Screenshot 1: a content-heavy page before and after wireframe mode.
- Screenshot 2: the floating toolbar panel, with Wireframe and Grey bars ticked, and a freehand drawing visible on the page.
- Screenshot 3: an added Container and Text Box sitting on top of a wireframed page, demonstrating copy/paste and selection.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Stores which modes are on, per tab, for the current browsing session only, using chrome.storage.session. Nothing is written to disk and nothing persists after the browser closes. |
| activeTab | permissions | Grants access to a single tab, only at the moment the user clicks the extension icon or presses the keyboard shortcut. The extension requests no host permissions and has no standing access to any site. |
| scripting | permissions | Injects the content scripts (content/engine.js, content/wireframe.js, content/toolbar.js) that apply the wireframe styling and render the toolbar, into that one tab. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

The extension makes no network requests. There is no analytics, telemetry,
tracking, or remote code of any kind.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [RECOMMENDED]
(Host PRIVACY.md at a public URL and paste it here)

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name** [REQUIRED]
(Fill in publisher name)

**Contact Email** [REQUIRED]
(Fill in email)

**Support URL / Email** [RECOMMENDED]
(Fill in support URL)

**Homepage URL** [RECOMMENDED]
(Fill in homepage URL)

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.4.0 | 2026-08-04 | Added freehand drawing tool, copy/paste (Cmd+C/Cmd+V) keyboard shortcuts, and full Undo stack (Cmd+Z). | Draft |
| 0.3.4 | 2026-08-04 | Wireframe renderer with sketch outlines and grey text bars; floating toolbar for adding containers and text boxes. | Unreleased |

## Review Notes

### Package contents
`manifest.json`, `background.js`, `content/engine.js`, `content/wireframe.js`,
`content/toolbar.js`, `icons/`. Docs, tests and the `test/` directory are not
shipped.

### Known Issues / Limitations
- Cannot run on `chrome://` pages, the Chrome Web Store, or other extensions'
  pages, per Chrome policy. The icon flashes a badge rather than failing
  silently.
- Reloading or navigating a drafted tab clears the wireframe and anything the
  user added. This is inherent to on-demand injection.
- Sub-frames that navigate on their own are not re-drafted until the next
  toggle.

### Rejection History
N/A
