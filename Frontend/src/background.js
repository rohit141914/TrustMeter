import { MSG } from "./constants";

chrome.runtime.onInstalled.addListener(() => {
  console.log("TrustMeter installed");
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.GET_DISMISSED_DOMAINS) {
    chrome.storage.local.get(null, (items) => {
      const domains = Object.keys(items).filter((key) => items[key] === true);
      sendResponse({ domains });
    });
    return true; // keep channel open for async response
  }

  if (message.type === MSG.RESET_DOMAIN) {
    chrome.storage.local.remove(message.domain, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === MSG.RESET_ALL_DOMAINS) {
    chrome.storage.local.clear(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === MSG.FETCH_POLICY_PAGES) {
    // Only fetch HTML here — DOMParser is not available in service workers
    Promise.all(
      message.links.map(async (link) => {
        try {
          const res = await fetch(link.url);
          const html = await res.text();
          return { label: link.label, url: link.url, html };
        } catch {
          return null;
        }
      })
    )
      .then((results) => sendResponse({ success: true, data: results }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === MSG.IDENTIFY_LINKS) {
    const domain = message.domain || (sender.tab?.url ? new URL(sender.tab.url).hostname : null);
    fetch(`${import.meta.env.VITE_API_URL}/identify-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: message.links, domain }),
    })
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data: data.links }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === MSG.SUMMARIZE) {
    const domain = message.domain || (sender.tab?.url ? new URL(sender.tab.url).hostname : null);
    fetch(`${import.meta.env.VITE_API_URL}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message.content, domain, links: message.links }),
    })
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
