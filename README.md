# Gmail Label Tabs

A Chrome extension (Manifest V3) that adds a sticky tab bar inside Gmail for instant label navigation.

## What it does

- Renders a tab bar at the top of the Gmail inbox — **Inbox** is always pinned first
- Clicking a tab opens that label (Gmail's native `#label/...` view)
- Active tab shows a blue underline indicator
- Settings panel (gear icon) lets you pick which labels to show and drag to reorder
- Saved to `chrome.storage.sync` — persists across sessions and syncs across devices

**No Google sign-in, no OAuth, no network requests.** Labels are read directly
from Gmail's own sidebar in the page, and navigation uses Gmail's URL hashes.
The only permission requested is `storage` (to remember your pinned tabs) plus
access to `mail.google.com` (to inject the bar).

---

## Setup

### Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this `inboxtabs` folder
4. Open [Gmail](https://mail.google.com) — the tab bar appears at the top

That's it. There's nothing else to configure.

---

## Usage

1. Open [Gmail](https://mail.google.com)
2. The tab bar appears at the top — **Inbox** is shown by default
3. Click the **gear icon** (right side of the bar) to open settings
4. Tick labels to pin them as tabs; drag rows to reorder
5. Click **Save** — the bar updates immediately

### If a label is missing from the list

The settings panel reads your labels from Gmail's sidebar, which only contains
the labels currently visible there. Labels tucked under **More**, collapsed
nested labels, or labels set to **hide** in the label list may not appear.

- **Type the label's exact name** into the "Add a label by name" field and click
  **Add** — this works regardless of sidebar visibility.
- If the list is empty (e.g. Gmail hadn't finished loading), click **Retry**.

### Fixing a renamed or stale tab

Tabs are matched to labels by name. If you rename a label in Gmail, its tab will
no longer match. Open the gear, find the tab (it shows a small ⚠ hint when it
isn't currently visible in your sidebar), and either:

- Click the **pencil (✎)** to edit the stored name, or
- **Untick** it to remove the tab.

---

## File overview

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest — permissions and content script declaration |
| `content.js` | Injected into Gmail — scrapes labels, renders tab bar + settings, MutationObserver, hash-change handler |
| `styles.css` | Injected CSS — tab bar and settings panel styles, all prefixed `glt-` |
| `popup.html` | Extension toolbar popup — quick link to open Gmail |
| `mockup.html` | Static UI mockup for reference |

---

## Publishing to the Chrome Web Store (notes)

This version is store-ready in terms of permissions (only `storage` + the Gmail
host) and makes no network calls, so it does **not** require Google's OAuth
verification. Before submitting you'll still need to add listing assets:

- Extension icons (16/32/48/128 px) referenced from `manifest.json`
- Store screenshots and a description
- A privacy policy URL (can simply state that no data is collected or
  transmitted — the extension stores pinned tab names locally via
  `chrome.storage.sync` only)
