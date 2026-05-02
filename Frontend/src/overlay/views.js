import {
  RISK_COLORS,
  POLICY_BROAD_WORDS,
  STRIPPED_ELEMENTS,
  MAX_POLICY_TEXT_LENGTH,
  MAX_POLICIES_TO_FETCH,
  MSG,
} from "../constants";
import { createCard, clearContent, dismiss, escapeHTML } from "../utils";
import { getShadow, enableVerticalDrag } from "./host";
import { wireThemeToggle } from "./theme";
import {
  createIconWrap,
  headerHTML,
  normalizeRiskKey,
  renderClausesHTML,
} from "./components";

const domain = window.location.hostname;
let cachedResult = null;
let analysisInFlight = false;

export function injectIcon() {
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

function collapseToIcon(shadow) {
  renderIcon(shadow);
}

function buildCard(shadow, bodyHTML) {
  clearContent(shadow);
  const card = createCard();
  card.innerHTML = headerHTML() + bodyHTML;
  shadow.appendChild(card);
  card.querySelector(".rr-close").onclick = () => collapseToIcon(shadow);
  wireThemeToggle(card);
  return card;
}

function showLoading(shadow) {
  buildCard(
    shadow,
    `
    <div class="rr-body rr-loading">
      <div class="rr-spinner"></div>
      <p>Scanning terms &amp; privacy policies...</p>
    </div>
  `
  );
}

function showEmpty(shadow) {
  buildCard(
    shadow,
    `
    <div class="rr-body rr-error">
      <p><strong>No policies found on this page.</strong></p>
      <p>Read Rules couldn't detect any Terms or Privacy links here.</p>
    </div>
  `
  );
}

function showError(shadow) {
  const card = buildCard(
    shadow,
    `
    <div class="rr-body rr-error">
      <p><strong>Could not analyze this page.</strong></p>
      <p>The backend service may be offline. Make sure it's running at <code>${import.meta.env.VITE_API_URL}</code>.</p>
      <button class="rr-btn rr-btn-ghost" id="rr-retry">Retry</button>
    </div>
  `
  );
  card.querySelector("#rr-retry").onclick = () => {
    cachedResult = null;
    triggerAnalysis(shadow);
  };
}

function showResult(shadow, data) {
  const summary =
    typeof data === "string" ? data : data.summary || "No summary available.";
  const riskLevel = data.risk_level || "unknown";
  const risk = RISK_COLORS[riskLevel] || RISK_COLORS.unknown;
  const riskKey = normalizeRiskKey(riskLevel);

  const card = buildCard(
    shadow,
    `
    <div class="rr-body">
      <div class="rr-risk-badge rr-risk-${riskKey}">${escapeHTML(risk.label)}</div>
      <div class="rr-summary">
        <h4>Summary</h4>
        <p>${escapeHTML(summary)}</p>
      </div>
      ${renderClausesHTML(data.clauses)}
      <div class="rr-actions">
        <button class="rr-btn rr-btn-primary" id="rr-accept">I've read this &ndash; Don't show again</button>
      </div>
    </div>
  `
  );
  card.querySelector("#rr-accept").onclick = () => {
    chrome.storage.local.set({ [domain]: true });
    dismiss();
  };
}

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

    const policyTexts = (fetchedPages || []).map((page) => {
      if (!page) return null;
      const parser = new DOMParser();
      const doc = parser.parseFromString(page.html, "text/html");
      doc.querySelectorAll(STRIPPED_ELEMENTS).forEach((el) => el.remove());
      const text = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
      return {
        label: page.label,
        url: page.url,
        text: text.slice(0, MAX_POLICY_TEXT_LENGTH),
      };
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
