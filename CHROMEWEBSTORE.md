# Chrome Web Store Listing: WWWire

> Last Updated: 2026-08-18
>
> Everything here must describe the build actually being uploaded. Reviewers
> check the listing against the package, and a listing that promises features
> the ZIP does not contain, or names a file that is not in it, is a rejection.

## Store Listing

**Extension Name** [REQUIRED]
WWWire - Live Website Wireframes

**Short Description** [REQUIRED]
Turn any website into a lo-fi wireframe, then sketch on top of it with your own freehand drawings, containers, and text boxes.

**Detailed Description** [REQUIRED]
WWWire strips any live website down to its bare structure, instantly transforming it into a clean, lo-fi wireframe. See the layout instead of the design, and sketch your own ideas directly on top of the real page before anyone even opens a design tool.

Features:
• Instant Wireframing: One click flattens the page into a high-contrast blueprint. Colors vanish, decorations are removed, and images collapse into flat grey placeholders with hand-drawn sketch outlines around structural elements.
• Grey-out Typography: Toggle "Grey bars" to replace all text with bars sized perfectly to the real copy. Focus on visual rhythm and hierarchy without getting distracted by the words.
• On-Page Sketching: A floating toolbar lets you draw freehand shapes, place structural containers, and add custom text boxes anywhere on the page.
• Powerful Keyboard Controls: Drag, resize, and delete elements easily. Duplicate objects with standard Copy/Paste (Cmd+C/Cmd+V) and undo any mistakes with a full Undo stack (Cmd+Z).

Use Cases:
- Reverse-engineer how complex pages are built and structured.
- Present simplified layouts to stakeholders to focus feedback on structure rather than visual design.
- Quickly mock up layout changes or new elements directly over a live production site.

Privacy & Security:
WWWire is 100% private and runs locally on your device. It makes zero network requests, collects absolutely no data, and only injects its scripts when you explicitly click the extension icon on a specific tab.

Note: WWWire adds temporary elements over the page. It does not permanently modify or delete the website's original content. Reloading the page will completely restore it to normal.

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
| Screenshot 1 [REQUIRED] | 1280x800 | Ready | video-and-screenshots/store-1.png |
| Screenshot 2 [RECOMMENDED] | 1280x800 | Ready | video-and-screenshots/store-2.png |
| Screenshot 3 [RECOMMENDED] | 1280x800 | Ready | video-and-screenshots/store-3.png |
| Screenshot 4 [RECOMMENDED] | 1280x800 | Ready | video-and-screenshots/store-4.png |
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
| 0.6.0 | 2026-08-18 | Redesigned toolbar with full-width drag handle and close button; improved YouTube promo videos and high-res store screenshots. | Draft |
| 0.5.0 | 2026-08-18 | Custom checkboxes, dynamic versioning, and updated extension icons. | Released |
| 0.4.0 | 2026-08-04 | Added freehand drawing tool, copy/paste (Cmd+C/Cmd+V) keyboard shortcuts, and full Undo stack (Cmd+Z). | Released |
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
