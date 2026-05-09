# TrustMeter

A Chrome extension that automatically detects, fetches, and analyzes Terms of Service and Privacy Policies on any website — giving you a plain-English risk summary and a list of flagged clauses before you click "I Agree".

---

## How It Works

1. **Detect** — When you visit a page, the extension scans all links for policy-related keywords (privacy, terms, legal, cookie, etc.)
2. **Identify** — A pre-filtered list of candidate links is sent to the backend, where an LLM picks out the actual policy links
3. **Fetch** — Policy pages are fetched via the background service worker (bypassing CORS)
4. **Analyze** — The extracted text is sent to the backend, which uses an LLM to produce a risk summary and list of flagged clauses
5. **Display** — An overlay card appears with the risk level, summary, and actionable clause breakdowns

---

## Features

- Automatic policy detection on every page load
- LLM-powered analysis via OpenAI, Anthropic, Google Gemini, or Ollama (local)
- Risk classification: **High**, **Medium**, **Low**
- Flagged clauses with plain-English explanations ("What the policy says" / "Why this matters")
- Two-tier caching: in-memory TTL cache + MongoDB persistence
- Automatic re-analysis when a policy's content changes (SHA-256 content hashing)
- Per-domain "Don't show again" preference, manageable from the popup
- Shadow DOM isolation — the overlay never interferes with the host page's styles

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Chrome Extension                     │
│                                                       │
│  overlay.jsx          background.js        App.jsx   │
│  (content script)     (service worker)    (popup UI) │
│       │                     │                        │
│       │── IDENTIFY_LINKS ──▶│                        │
│       │── FETCH_POLICY_PAGES▶│── fetch(policy URL)   │
│       │── SUMMARIZE ────────▶│── POST /summarize     │
└──────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────┐
│               Backend (FastAPI)                       │
│                                                       │
│   POST /identify-links   POST /summarize              │
│         │                      │                     │
│         └──────┬───────────────┘                     │
│                ▼                                      │
│         LLM Provider                                  │
│    (OpenAI / Anthropic / Gemini / Ollama)             │
│                │                                      │
│         ┌──────┴──────┐                              │
│         ▼             ▼                               │
│   Memory Cache    MongoDB                             │
│   (TTL: 1hr)    (persistent)                          │
└──────────────────────────────────────────────────────┘
```

---

## Project Structure

```
trustmeter/
├── Backend/
│   ├── main.py               # FastAPI app, endpoints, caching logic
│   ├── database.py           # MongoDB async operations (Motor)
│   ├── cache.py              # In-memory TTL cache
│   ├── config.py             # Environment settings (Pydantic)
│   ├── prompt.py             # LLM system prompt
│   ├── schemas.py            # Request/response Pydantic models
│   ├── providers/
│   │   ├── anthropic_provider.py
│   │   ├── openai_provider.py
│   │   ├── gemini_provider.py
│   │   └── ollama_provider.py
│   ├── .env.example
│   └── requirements.txt
│
└── Frontend/
    ├── manifest.json         # Chrome Extension Manifest V3
    ├── src/
    │   ├── overlay.jsx       # Content script — detection & overlay UI
    │   ├── background.js     # Service worker — fetching & API calls
    │   ├── App.jsx           # Popup — manage dismissed domains
    │   ├── constants.js      # Shared config, keywords, message types
    │   └── utils.js          # DOM helpers
    └── package.json
```

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- MongoDB (local or Atlas)
- An API key for at least one LLM provider

---

### Backend

```bash
cd Backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in your values
uvicorn main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

---

### Frontend

```bash
cd Frontend
npm install
cp .env.example .env.local      # set VITE_API_URL
npm run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `Frontend/dist` folder

---

## Configuration

### Backend — `Backend/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | Yes | `openai` | `openai` \| `anthropic` \| `gemini` \| `ollama` |
| `LLM_MODEL` | Yes | `gpt-4o-mini` | Model name for the chosen provider |
| `OPENAI_API_KEY` | If using OpenAI | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | If using Anthropic | — | Anthropic API key |
| `GEMINI_API_KEY` | If using Gemini | — | Google Gemini API key |
| `OLLAMA_BASE_URL` | If using Ollama | `http://localhost:11434` | Local Ollama endpoint |
| `MONGO_URI` | Yes | — | MongoDB connection string |
| `MONGO_DB_NAME` | Yes | — | MongoDB database name |
| `CACHE_TTL` | No | `3600` | In-memory cache TTL in seconds |

### Frontend — `Frontend/.env.local`

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL, e.g. `http://127.0.0.1:8000` |

---

## LLM Providers

| Provider | Recommended Model | Notes |
|---|---|---|
| **Anthropic** | `claude-haiku-4-5-20251001` | Fast, cost-effective |
| **OpenAI** | `gpt-4o-mini` | Good balance of quality and speed |
| **Google Gemini** | `gemini-2.0-flash` | Free tier available |
| **Ollama** | `llama3`, `mistral`, etc. | Fully local, no API key needed |

To switch providers, update `LLM_PROVIDER` and `LLM_MODEL` in `Backend/.env` and restart the server.

---

## Caching

Analyses are cached at two levels:

1. **In-memory (TTL cache)** — keyed by content hash; automatically expires after `CACHE_TTL` seconds
2. **MongoDB (persistent)** — keyed by domain; survives server restarts

When a cached domain is requested, the backend compares the stored SHA-256 content hash with the current policy text. If the policy has changed, it re-analyzes automatically.

Each MongoDB document stores:
- `domain` — the site hostname
- `result` — the full LLM analysis
- `content_hash` — SHA-256 of the policy text at time of analysis
- `links` — the policy links found on the page
- `created_at` — when first analyzed
- `last_updated_at` — when last re-analyzed

---

## Popup

Click the TrustMeter icon in the Chrome toolbar to:

- See which domain you're currently on and whether it's been dismissed
- View all dismissed domains
- Re-enable analysis for a specific domain ("Re-enable")
- Clear all dismissed domains ("Reset All")

---

## Development

```bash
# Backend with auto-reload
cd Backend && uvicorn main:app --reload

# Frontend with HMR (for popup development)
cd Frontend && npm run dev

# Rebuild extension after changes
cd Frontend && npm run build
```

After rebuilding, go to `chrome://extensions` and click the reload icon on the TrustMeter card.
