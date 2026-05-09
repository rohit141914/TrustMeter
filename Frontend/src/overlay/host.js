import overlayStyles from "../overlay.css?inline";

let shadowRoot = null;

export function getShadow() {
  if (shadowRoot) return shadowRoot;

  const host = document.createElement("div");
  host.id = "trustmeter-host";
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

export function enableVerticalDrag(handle, host, options = {}) {
  const { swallowClickAfterDrag = true, ignoreSelector = null } = options;
  const DRAG_THRESHOLD = 5;

  handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (ignoreSelector && e.target.closest(ignoreSelector)) return;

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
      if (dragging && swallowClickAfterDrag) {
        const swallow = (clickEv) => {
          clickEv.stopPropagation();
          clickEv.preventDefault();
          handle.removeEventListener("click", swallow, true);
        };
        handle.addEventListener("click", swallow, true);
        handle.blur?.();
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
