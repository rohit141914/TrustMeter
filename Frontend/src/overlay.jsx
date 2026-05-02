import overlayStyles from "./overlay.css?inline";
import {
  POLICY_BROAD_WORDS,
  RISK_COLORS,
  STRIPPED_ELEMENTS,
  MAX_POLICY_TEXT_LENGTH,
  MAX_POLICIES_TO_FETCH,
  MSG,
} from "./constants";
import { createCard, clearContent, createIconWrap, dismiss, escapeHTML } from "./utils";

const domain = window.location.hostname;

let shadowRoot = null;
let cachedResult = null;
let analysisInFlight = false;
let theme = "dark";

// Skip browser internal pages
if (
  !domain ||
  domain === "newtab" ||
  window.location.protocol === "chrome:" ||
  window.location.protocol === "chrome-extension:"
) {
  // do nothing
} else {
  chrome.storage.local.get([domain], (result) => {
    if (result[domain]) return;
    injectIcon();
  });
}

// --- Shadow DOM host (created once, reused across icon ↔ card transitions) ---
function getShadow() {
  if (shadowRoot) return shadowRoot;

  const host = document.createElement("div");
  host.id = "read-rules-host";
  host.style.cssText =
    "all:initial; position:fixed; z-index:2147483647; top:50%; right:20px; transform:translateY(-50%);";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayStyles;
  shadow.appendChild(style);

  shadowRoot = shadow;
  return shadow;
}

// --- Icon: default resting state ---
function injectIcon() {
  renderIcon(getShadow());
}

function renderIcon(shadow) {
  clearContent(shadow);
  const wrap = createIconWrap({
    onClick: () => triggerAnalysis(shadow),
    tooltip: "Start analysing",
  });
  shadow.appendChild(wrap);
  enableVerticalDrag(wrap.querySelector(".rr-icon-btn"), shadow.host);
}

function enableVerticalDrag(button, host) {
  const DRAG_THRESHOLD = 5;
  button.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const startY = e.clientY;
    const startTop = host.getBoundingClientRect().top;
    let dragging = false;

    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      if (!dragging && Math.abs(dy) > DRAG_THRESHOLD) dragging = true;
      if (!dragging) return;
      const maxTop = window.innerHeight - host.offsetHeight;
      const clamped = Math.max(0, Math.min(maxTop, startTop + dy));
      host.style.top = clamped + "px";
      host.style.transform = "none";
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (dragging) {
        const swallow = (clickEv) => {
          clickEv.stopPropagation();
          clickEv.preventDefault();
          button.removeEventListener("click", swallow, true);
        };
        button.addEventListener("click", swallow, true);
        button.blur();
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function collapseToIcon(shadow) {
  renderIcon(shadow);
}

// --- Click handler: run the full analysis pipeline (or replay cached result) ---
async function triggerAnalysis(shadow) {
  if (cachedResult) {
    showResult(shadow, cachedResult);
    return;
  }
  if (analysisInFlight) {
    showLoading(shadow);
    return;
  }

  showLoading(shadow);
  analysisInFlight = true;

  try {
    const candidateLinks = collectCandidateLinks();
    if (candidateLinks.length === 0) {
      showEmpty(shadow);
      return;
    }

    const policyLinks = await sendMessage({
      type: MSG.IDENTIFY_LINKS,
      links: candidateLinks,
      domain,
    });
    if (!policyLinks || policyLinks.length === 0) {
      showEmpty(shadow);
      return;
    }

    const linksToFetch = policyLinks.slice(0, MAX_POLICIES_TO_FETCH);
    const fetchedPages = await sendMessage({
      type: MSG.FETCH_POLICY_PAGES,
      links: linksToFetch,
    });

    // Parse HTML here — DOMParser is available in content scripts but not in service workers
    const policyTexts = (fetchedPages || []).map((page) => {
      if (!page) return null;
      const parser = new DOMParser();
      const doc = parser.parseFromString(page.html, "text/html");
      doc.querySelectorAll(STRIPPED_ELEMENTS).forEach((el) => el.remove());
      const text = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
      return { label: page.label, url: page.url, text: text.slice(0, MAX_POLICY_TEXT_LENGTH) };
    });

    const validPolicies = policyTexts.filter(Boolean);
    if (validPolicies.length === 0) {
      showError(shadow);
      return;
    }

    const combined = validPolicies
      .map((p) => `[${p.label}]\n${p.text}`)
      .join("\n\n---\n\n");

    const links = validPolicies.map((p) => ({ label: p.label, url: p.url }));
    const response = await sendMessage({
      type: MSG.SUMMARIZE,
      content: combined,
      domain,
      links,
    });

    cachedResult = response;
    showResult(shadow, response);
  } catch (err) {
    console.error("Read Rules: Error analyzing policies:", err);
    showError(shadow);
  } finally {
    analysisInFlight = false;
  }
}

// --- Helpers ---
function collectCandidateLinks() {
  const seen = new Set();
  const candidates = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.href;
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const label = a.textContent.replace(/\s+/g, " ").trim();
    const combined = (label + " " + href).toLowerCase();
    if (POLICY_BROAD_WORDS.some((w) => combined.includes(w))) {
      candidates.push({ url: href, label: label || href });
    }
  }
  return candidates;
}

function sendMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (res) => {
      if (res?.success) resolve(res.data);
      else reject(new Error(res?.error || "Background request failed"));
    });
  });
}

function wireThemeToggle(card) {
  const btn = card.querySelector(".rr-theme-toggle");
  if (!btn) return;
  applyTheme(card);
  btn.onclick = () => {
    theme = theme === "light" ? "dark" : "light";
    applyTheme(card);
  };
}

function applyTheme(card) {
  card.classList.toggle("rr-theme-dark", theme === "dark");
  const btn = card.querySelector(".rr-theme-toggle");
  if (btn) btn.innerHTML = theme === "dark" ? "&#x2600;&#xfe0f;" : "&#x1f319;";
}

// --- Loading State ---
function showLoading(shadow) {
  clearContent(shadow);
  const card = createCard();
  card.innerHTML = `
    <div class="rr-header">
      <span class="rr-logo">&#x1f6e1;</span>
      <span class="rr-title">Read Rules</span>
      <button class="rr-theme-toggle" aria-label="Toggle theme"></button>
      <button class="rr-close" aria-label="Close">&times;</button>
    </div>
    <div class="rr-body rr-loading">
      <div class="rr-spinner"></div>
      <p>Scanning terms &amp; privacy policies...</p>
    </div>
  `;
  shadow.appendChild(card);
  card.querySelector(".rr-close").onclick = () => collapseToIcon(shadow);
  wireThemeToggle(card);
}

// --- Result State ---
function showResult(shadow, data) {
  clearContent(shadow);
  const card = createCard();

  const summary =
    typeof data === "string" ? data : data.summary || "No summary available.";
  const riskLevel = data.risk_level || "unknown";
  const clauses = data.clauses || [];

  const risk = RISK_COLORS[riskLevel] || RISK_COLORS.unknown;
  const riskKey = RISK_COLORS[riskLevel] ? riskLevel : "unknown";

  let clausesHTML = "";
  if (clauses.length > 0) {
    clausesHTML = `
      <div class="rr-clauses">
        <h4>Flagged Clauses</h4>
        ${clauses
          .map((c) => {
            const riskKey = RISK_COLORS[c.risk] ? c.risk : "unknown";
            return `
            <div class="rr-clause rr-risk-${riskKey}">
              <span class="rr-clause-badge">${escapeHTML((c.risk || "info").toUpperCase())}</span>
              <p class="rr-clause-label">What the policy says</p>
              <p class="rr-clause-text">${escapeHTML(c.text)}</p>
              ${c.reason ? `<p class="rr-clause-label">Why this matters</p><p class="rr-clause-reason">${escapeHTML(c.reason)}</p>` : ""}
            </div>`;
          })
          .join("")}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="rr-header">
      <span class="rr-logo">&#x1f6e1;</span>
      <span class="rr-title">Read Rules</span>
      <button class="rr-theme-toggle" aria-label="Toggle theme"></button>
      <button class="rr-close" aria-label="Close">&times;</button>
    </div>
    <div class="rr-body">
      <div class="rr-risk-badge rr-risk-${riskKey}">
        ${escapeHTML(risk.label)}
      </div>
      <div class="rr-summary">
        <h4>Summary</h4>
        <p>${escapeHTML(summary)}</p>
      </div>
      ${clausesHTML}
      <div class="rr-actions">
        <button class="rr-btn rr-btn-primary" id="rr-accept">I've read this &ndash; Don't show again</button>
      </div>
    </div>
  `;

  shadow.appendChild(card);

  card.querySelector(".rr-close").onclick = () => collapseToIcon(shadow);
  card.querySelector("#rr-accept").onclick = () => {
    chrome.storage.local.set({ [domain]: true });
    dismiss();
  };
  wireThemeToggle(card);
}

// --- Empty State (no policies found on this page) ---
function showEmpty(shadow) {
  clearContent(shadow);
  const card = createCard();
  card.innerHTML = `
    <div class="rr-header">
      <span class="rr-logo">&#x1f6e1;</span>
      <span class="rr-title">Read Rules</span>
      <button class="rr-theme-toggle" aria-label="Toggle theme"></button>
      <button class="rr-close" aria-label="Close">&times;</button>
    </div>
    <div class="rr-body rr-error">
      <p><strong>No policies found on this page.</strong></p>
      <p>Read Rules couldn't detect any Terms or Privacy links here.</p>
    </div>
  `;
  shadow.appendChild(card);
  card.querySelector(".rr-close").onclick = () => collapseToIcon(shadow);
  wireThemeToggle(card);
}

// --- Error State ---
function showError(shadow) {
  clearContent(shadow);
  const card = createCard();
  card.innerHTML = `
    <div class="rr-header">
      <span class="rr-logo">&#x1f6e1;</span>
      <span class="rr-title">Read Rules</span>
      <button class="rr-theme-toggle" aria-label="Toggle theme"></button>
      <button class="rr-close" aria-label="Close">&times;</button>
    </div>
    <div class="rr-body rr-error">
      <p><strong>Could not analyze this page.</strong></p>
      <p>The backend service may be offline. Make sure it's running at <code>${import.meta.env.VITE_API_URL}</code>.</p>
      <button class="rr-btn rr-btn-ghost" id="rr-retry">Retry</button>
    </div>
  `;
  shadow.appendChild(card);
  card.querySelector(".rr-close").onclick = () => collapseToIcon(shadow);
  card.querySelector("#rr-retry").onclick = () => {
    cachedResult = null;
    triggerAnalysis(shadow);
  };
  wireThemeToggle(card);
}
