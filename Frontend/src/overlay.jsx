import { injectIcon } from "./overlay/views";

const domain = window.location.hostname;

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
