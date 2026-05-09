let theme = "dark";

export function wireThemeToggle(card) {
  const btn = card.querySelector(".tm-theme-toggle");
  if (!btn) return;
  applyTheme(card);
  btn.onclick = () => {
    theme = theme === "light" ? "dark" : "light";
    applyTheme(card);
  };
}

export function applyTheme(card) {
  card.classList.toggle("tm-theme-dark", theme === "dark");
  const btn = card.querySelector(".tm-theme-toggle");
  if (btn) btn.innerHTML = theme === "dark" ? "&#x2600;&#xfe0f;" : "&#x1f319;";
}
