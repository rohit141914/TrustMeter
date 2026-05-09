import { useState, useEffect } from "react";
import { MSG } from "./constants";
import iconUrl from "./images/icon.png";

function App() {
  const [domains, setDomains] = useState([]);
  const [currentDomain, setCurrentDomain] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get current tab domain
    if (chrome?.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          try {
            const url = new URL(tabs[0].url);
            setCurrentDomain(url.hostname);
          } catch {
            setCurrentDomain("");
          }
        }
      });
    }

    // Get dismissed domains
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: MSG.GET_DISMISSED_DOMAINS }, (res) => {
        if (res?.domains) {
          setDomains(res.domains);
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleReset = (domain) => {
    if (!chrome?.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ type: MSG.RESET_DOMAIN, domain }, () => {
      setDomains((prev) => prev.filter((d) => d !== domain));
    });
  };

  const handleResetAll = () => {
    if (!chrome?.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ type: MSG.RESET_ALL_DOMAINS }, () => {
      setDomains([]);
    });
  };

  const isDismissed = domains.includes(currentDomain);

  return (
    <div className="popup">
      <header className="popup-header">
        <div className="logo">
          <img className="logo-icon" src={iconUrl} alt="" />
          <h1>TrustMeter</h1>
        </div>
        <p className="tagline">Your privacy watchdog</p>
      </header>

      {currentDomain && (
        <section className="current-site">
          <h2>Current Site</h2>
          <div className="site-card">
            <span className="domain-name">{currentDomain}</span>
            <span className={`status-badge ${isDismissed ? "dismissed" : "active"}`}>
              {isDismissed ? "Dismissed" : "Monitoring"}
            </span>
          </div>
          {isDismissed && (
            <button className="btn btn-secondary" onClick={() => handleReset(currentDomain)}>
              Re-enable for this site
            </button>
          )}
        </section>
      )}

      <section className="dismissed-list">
        <div className="section-header">
          <h2>Dismissed Sites</h2>
          <span className="count">{domains.length}</span>
        </div>

        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : domains.length === 0 ? (
          <p className="empty-state">No dismissed sites yet. Browse the web and TrustMeter will analyze pages for you.</p>
        ) : (
          <>
            <ul>
              {domains.map((domain) => (
                <li key={domain}>
                  <span className="domain-name">{domain}</span>
                  <button className="btn-icon" title="Re-enable" onClick={() => handleReset(domain)}>
                    &#x21bb;
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn btn-danger" onClick={handleResetAll}>
              Reset All
            </button>
          </>
        )}
      </section>

      <footer className="popup-footer">
        <p>TrustMeter v1.0</p>
      </footer>
    </div>
  );
}

export default App;
