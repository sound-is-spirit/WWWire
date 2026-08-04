# Chrome Web Store Listing — WireDrafter

> Last Updated: 2026-08-04

## Store Listing

**Extension Name** [REQUIRED]
WireDrafter

**Short Description** [REQUIRED]
Turn any website into an editable lo-fi wireframe. Strip the styling, sketch the structure, move and delete anything.

**Detailed Description** [REQUIRED]
WireDrafter turns any website into an editable lo-fi wireframe instantly.
Features:
- Toggle wireframe mode to strip complex CSS and reveal the underlying layout
- Replace all text with generic "greek" text to focus on structure
- Show crisp outlines of every block-level element
- Edit mode lets you drag and drop, or delete any element on the page
Whether you're exploring the structure of an existing site, presenting a simplified layout to stakeholders, or brainstorming layout changes directly in the browser, WireDrafter provides an unobtrusive, on-demand set of tools.
Privacy: WireDrafter runs entirely locally. It does not track you, does not send data off your device, and only injects its tools into tabs when you explicitly click the icon or use the keyboard shortcut.
For support or feedback, please visit our repository.

**Category** [REQUIRED]
Developer Tools

**Single Purpose** [REQUIRED]
Converts live websites into interactive, editable wireframes by stripping styles and allowing elements to be moved or deleted.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | icons/bar128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 4 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 5 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
- Screenshot 1: Split view showing a complex website on the left and the wireframe version on the right.
- Screenshot 2: Demonstration of the extension popup with toggles.
- Screenshot 3: User moving an element with the "edit" outline visible.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Required to temporarily save the ON/OFF state (wireframe/greek/crisp/edit modes) per tab during a browsing session using chrome.storage.session. |
| activeTab | permissions | Required to inject the wireframing CSS and JS tools into the current tab only when the user explicitly clicks the extension action or uses the keyboard shortcut. |
| scripting | permissions | Required to execute the content scripts (engine.js, wireframe.js, edit.js) that apply the visual transformations and enable drag-and-drop editing. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [RECOMMENDED]
(Host the PRIVACY.md on a public site)

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
| 0.3.0 | 2026-08-04 | Added popup with configuration toggles, edit mode with move/delete support and undo stack. | Draft |
| 0.2.0 | | Basic wireframe stripping and greek text rendering. | |

## Review Notes

### Known Issues / Limitations
None known at this time.

### Rejection History
N/A
