import {
  POLICY_BROAD_WORDS,
  STRIPPED_ELEMENTS,
  MAX_POLICY_TEXT_LENGTH,
  MAX_POLICIES_TO_FETCH,
  MSG,
} from "../constants";
import { createCard, clearContent, dismiss } from "../utils";
import { getShadow, enableVerticalDrag } from "./host";
import { wireThemeToggle } from "./theme";
import {
  createIconWrap,
  headerHTML,
  renderFindingsHTML,
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
  enableVerticalDrag(wrap.querySelector(".tm-icon-btn"), shadow.host);
}

function collapseToIcon(shadow) {
  renderIcon(shadow);
}

function buildCard(shadow, bodyHTML) {
  clearContent(shadow);
  const card = createCard();
  card.innerHTML = headerHTML() + bodyHTML;
  shadow.appendChild(card);
  card.querySelector(".tm-close").onclick = () => collapseToIcon(shadow);
  wireThemeToggle(card);
  enableVerticalDrag(card.querySelector(".tm-header"), shadow.host, {
    swallowClickAfterDrag: false,
    ignoreSelector: "button",
  });
  return card;
}

function showLoading(shadow) {
  buildCard(
    shadow,
    `
    <div class="tm-body tm-loading">
      <div class="tm-spinner"></div>
      <p>Scanning terms &amp; privacy policies...</p>
    </div>
  `
  );
}

function showEmpty(shadow) {
  buildCard(
    shadow,
    `
    <div class="tm-body tm-error">
      <p><strong>No policies found on this page.</strong></p>
      <p>TrustMeter couldn't detect any Terms or Privacy links here.</p>
    </div>
  `
  );
}

function showError(shadow) {
  const card = buildCard(
    shadow,
    `
    <div class="tm-body tm-error">
      <p><strong>Could not analyze this page.</strong></p>
      <p>The backend service may be offline. Make sure it's running at <code>${import.meta.env.VITE_API_URL}</code>.</p>
      <button class="tm-btn tm-btn-ghost" id="tm-retry">Retry</button>
    </div>
  `
  );
  card.querySelector("#tm-retry").onclick = () => {
    cachedResult = null;
    triggerAnalysis(shadow);
  };
}

function showResult(shadow, data) {
  const findings = Array.isArray(data?.findings) ? data.findings : [];

  const card = buildCard(
    shadow,
    `
    <div class="tm-body">
      ${renderFindingsHTML(findings)}
    </div>
    <div class="tm-actions">
      <button class="tm-btn tm-btn-primary" id="tm-accept">I've read this &ndash; Don't show again</button>
    </div>
    <div class="tm-coffee">
      <span class="tm-credits"><span class="tm-by-label">By:</span>
        <a class="tm-social-link" href="https://www.linkedin.com/in/rohitnain" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1。77-1。72V1。72C24 .77 23。21 0 22。23 0z"/>
          </svg>
        </a>
        <a class="tm-social-link" href="https://www.linkedin.com/in/hello-world-hi" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1。77-1。72V1。72C24 .77 23。21 0 22。23 0z"/>
          </svg>
        </a>
        </span>
        <a href="https://ko-fi.com/K3K51ZABO7" target="_blank" rel="noopener noreferrer">
          <img height="36" style="border:0px;height:36px;vertical-align:middle;" src="https://storage.ko-fi.com/cdn/kofi6.png?v=6" alt="Buy Me a Coffee at ko-fi.com" />
        </a>
    </div>
  `
  );
  card.querySelector("#tm-accept").onclick = () => {
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
    console.error("TrustMeter: Error analyzing policies:", err);
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
