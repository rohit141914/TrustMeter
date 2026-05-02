import { RISK_COLORS } from "../constants";
import { escapeHTML } from "../utils";

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

export function renderClausesHTML(clauses) {
  if (!clauses?.length) return "";
  const items = clauses
    .map((c) => {
      const riskKey = normalizeRiskKey(c.risk);
      return `
      <div class="rr-clause rr-risk-${riskKey}">
        <span class="rr-clause-badge">${escapeHTML((c.risk || "info").toUpperCase())}</span>
        <p class="rr-clause-label">What the policy says</p>
        <p class="rr-clause-text">${escapeHTML(c.text)}</p>
        ${c.reason ? `<p class="rr-clause-label">Why this matters</p><p class="rr-clause-reason">${escapeHTML(c.reason)}</p>` : ""}
      </div>`;
    })
    .join("");
  return `<div class="rr-clauses"><h4>Flagged Clauses</h4>${items}</div>`;
}
