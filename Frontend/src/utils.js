export function createCard() {
  const card = document.createElement("div");
  card.className = "tm-card";
  return card;
}

export function clearContent(shadow) {
  shadow.querySelectorAll(".tm-card, .tm-icon-wrap").forEach((el) => el.remove());
}

export function dismiss() {
  const host = document.getElementById("trustmeter-host");
  if (host) host.remove();
}

export function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
