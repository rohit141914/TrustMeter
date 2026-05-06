# Read Rules - How It Works

## Overview

Read Rules is a Chrome Extension (Manifest V3) that automatically detects Terms & Conditions and Privacy Policy links on any website, fetches and extracts their content, sends it to a backend API for summarization, and displays the results in an overlay popup with risk-level highlights.

---

## Architecture

```
Frontend (Chrome Extension)
├── manifest.json          → Extension config (permissions, scripts, popup)
├── index.html             → Popup entry point (extension icon click)
├── src/
│   ├── main.jsx           → React entry, mounts <App /> into popup
│   ├── App.jsx            → Popup UI (current site status, dismissed domains list)
│   ├── background.js      → Service worker (handles messages between popup & storage)
│   ├── overlay.jsx         → Content script (injected into every web page)
│   ├── overlay.css        → Styles for the overlay (injected into Shadow DOM)
│   ├── constants.js       → Shared constants (keywords, risk colors, message types)
│   ├── utils.js           → Shared helper functions (DOM utilities)
│   └── index.css          → Popup styles
└── .env                   → Environment variables (VITE_API_URL)

Backend (separate service, not in this repo)
└── POST /summarize        → Accepts policy text, returns summary + risk analysis
```

---

## Flow: What Happens When a User Visits a Website

### Step 1: Content Script Injection
- Chrome injects `overlay.jsx` into every page (`"matches": ["<all_urls>"]`).
- The script runs at `document_idle` (after the page has loaded).

### Step 2: Check If Already Dismissed
- Reads `chrome.storage.local` for the current domain.
- If the user previously clicked "Don't show again" for this domain, the script exits silently.

### Step 3: Scan for Policy Links
- `scanForPolicies()` searches all `<a>` tags on the page.
- Matches link text or href against keywords like "privacy policy", "terms of service", "cookie policy", etc. (defined in `constants.js`).
- If no policy links are found, nothing happens (no overlay shown).

### Step 4: Fetch & Extract Policy Content
- `analyzePolicies()` fetches up to 3 policy page URLs.
- Parses each response as HTML using `DOMParser`.
- Strips non-content elements (`<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<iframe>`, `<noscript>`).
- Extracts clean text (up to 5000 chars per policy).

### Step 5: Send to Backend
- Combines all extracted policy texts with labels.
- Sends a POST request to `VITE_API_URL/summarize` with the combined content.

### Step 6: Display Overlay
- Creates a Shadow DOM host (isolates styles from the host page).
- Shows a card in the bottom-right corner with:
  - **Risk badge** (High / Medium / Low) color-coded.
  - **Summary** of the policies.
  - **Flagged clauses** with individual risk levels and reasons.
  - **"I've read this - Don't show again"** button (saves to storage per domain).
  - **Dismiss** button (hides overlay without remembering).
  - **Minimize** toggle to collapse the card.

---

## Flow: Extension Popup (Icon Click)

1. User clicks the Read Rules icon in Chrome toolbar.
2. `index.html` loads, which mounts the React `<App />` component.
3. App queries `chrome.tabs` for the current tab's domain.
4. App sends `GET_DISMISSED_DOMAINS` message to the background service worker.
5. Background reads all keys from `chrome.storage.local` where value is `true`.
6. Popup displays:
   - Current site's monitoring/dismissed status.
   - Full list of dismissed domains with re-enable buttons.
   - "Reset All" to clear all saved preferences.

---

## Message Passing

Communication between popup, content script, and background uses `chrome.runtime.sendMessage`:

| Message Type           | Sender  | Handler      | Action                              |
|------------------------|---------|--------------|-------------------------------------|
| `GET_DISMISSED_DOMAINS`| Popup   | Background   | Returns all dismissed domain names  |
| `RESET_DOMAIN`         | Popup   | Background   | Removes a single domain from storage|
| `RESET_ALL_DOMAINS`    | Popup   | Background   | Clears all stored domains           |

---

## Backend API Contract

**Endpoint:** `POST /summarize`

**Request:**
```json
{
  "content": "[Privacy Policy]\n...extracted text...\n\n---\n\n[Terms of Service]\n...extracted text..."
}
```

**Response (expected format):**
```json
{
  "findings": [
    {
      "title": "Data Sharing",
      "risk": "high",
      "bullets": [
        "Your data may be sold to third parties",
        "No explicit consent required",
        "Covers personal and behavioral data"
      ]
    },
    {
      "title": "Cookie Tracking",
      "risk": "low",
      "bullets": ["Standard analytics tracking only"]
    }
  ]
}
```

Findings are sorted high → medium → low by the backend before they reach the overlay.

---

## Key Design Decisions

- **Shadow DOM** for the overlay prevents style conflicts with the host website.
- **`?inline` CSS import** lets Vite bundle the CSS as a string for Shadow DOM injection.
- **Per-domain storage** ensures preferences persist across browser sessions.
- **Optional chaining guards** (`chrome?.tabs?.query`) allow the popup to render during development outside the extension context.
- **Constants & utils extracted** into shared modules to avoid duplication across content script, popup, and background.

---

## Build & Load

```bash
cd Frontend
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `Frontend/dist` folder
