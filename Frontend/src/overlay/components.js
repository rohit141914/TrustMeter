import { RISK_COLORS } from "../constants";
import { escapeHTML } from "../utils";

const RISK_SHORT = {
  high: { label: "High", emoji: "\u{1F534}" },
  medium: { label: "Med", emoji: "\u{1F7E1}" },
  low: { label: "Low", emoji: "\u{1F7E2}" },
  unknown: { label: "N/A", emoji: "\u{26AA}" },
};

export function createIconWrap({ onClick, tooltip }) {
  const wrap = document.createElement("div");
  wrap.className = "rr-icon-wrap";
  wrap.innerHTML = `
    <span class="rr-icon-tooltip">${escapeHTML(tooltip)}</span>
    <button class="rr-icon-btn" aria-label="${escapeHTML(tooltip)}">&#x1f6e1;</button>
  `;
  wrap.querySelector(".rr-icon-btn").onclick = onClick;
  return wrap;
}

export function headerHTML() {
  return `
    <div class="rr-header">
      <span class="rr-logo">&#x1f6e1;</span>
      <span class="rr-title">Read Rules</span>
      <button class="rr-theme-toggle" aria-label="Toggle theme"></button>
      <button class="rr-close" aria-label="Close">&times;</button>
    </div>
  `;
}

export function normalizeRiskKey(key) {
  return RISK_COLORS[key] ? key : "unknown";
}

export function renderFindingsHTML(findings) {
  if (!findings?.length) {
    return `<p class="rr-empty">No findings.</p>`;
  }
  const total = findings.length;
  return findings
    .map((f, i) => {
      const riskKey = normalizeRiskKey(f.risk);
      const sev = RISK_SHORT[riskKey];
      const bullets = (f.bullets || [])
        .filter((b) => b && String(b).trim())
        .map((b) => `<li>${escapeHTML(String(b).trim())}</li>`)
        .join("");
      return `
      <div class="rr-finding rr-risk-${riskKey}">
        <div class="rr-finding-header">
          <span class="rr-finding-counter">${i + 1}/${total}</span>
          <span class="rr-finding-title">${escapeHTML(f.title || "")}</span>
          <span class="rr-finding-sev">${sev.emoji} ${escapeHTML(sev.label)}</span>
        </div>
        ${bullets ? `<ul class="rr-finding-bullets">${bullets}</ul>` : ""}
      </div>`;
    })
    .join("");
}
