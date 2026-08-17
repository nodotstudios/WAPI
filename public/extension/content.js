/**
 * WAPI CRM Extension Content Script
 * Injected into https://web.whatsapp.com
 */

(function () {
  console.log("[WAPI Extension] Content script initialized on WhatsApp Web");

  let activePhone = null;
  let panelIframe = null;
  let toggleBtn = null;
  let panelVisible = true;

  // Create & Inject Floating Toggle Button
  function injectToggleButton() {
    if (document.getElementById("wapi-toggle-btn")) return;

    toggleBtn = document.createElement("button");
    toggleBtn.id = "wapi-toggle-btn";
    toggleBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
      </svg>
      <span>WAPI CRM</span>
    `;
    toggleBtn.className = "wapi-fab-button";
    toggleBtn.addEventListener("click", () => {
      panelVisible = !panelVisible;
      if (panelIframe) {
        panelIframe.style.display = panelVisible ? "block" : "none";
      }
    });

    document.body.appendChild(toggleBtn);
  }

  // Create & Inject Side Panel Iframe
  function injectSidePanel() {
    if (document.getElementById("wapi-crm-iframe")) return;

    panelIframe = document.createElement("iframe");
    panelIframe.id = "wapi-crm-iframe";
    panelIframe.src = chrome.runtime.getURL("panel.html");
    panelIframe.className = "wapi-side-panel";
    document.body.appendChild(panelIframe);
  }

  // Extract phone number from WhatsApp Web DOM
  function extractActivePhone() {
    try {
      const header = document.querySelector("#main header");
      if (!header) return null;

      // Try finding title or phone text
      const titleEl = header.querySelector("span[title]") || header.querySelector("div[role='button'] span");
      if (!titleEl) return null;

      const titleText = titleEl.getAttribute("title") || titleEl.textContent || "";
      const digits = titleText.replace(/\D/g, "");

      if (digits && digits.length >= 7) {
        return digits;
      }

      // Check subtext or phone attributes in chat header
      const subtextEl = header.querySelector("span.selectable-text") || header.querySelector("span[dir='auto']");
      if (subtextEl) {
        const subDigits = subtextEl.textContent.replace(/\D/g, "");
        if (subDigits && subDigits.length >= 7) return subDigits;
      }

      return titleText.trim();
    } catch (e) {
      return null;
    }
  }

  // Send phone updates to panel iframe
  function notifyPanel(phone) {
    if (!panelIframe || !panelIframe.contentWindow) return;
    panelIframe.contentWindow.postMessage(
      {
        type: "WAPI_CONTACT_CHANGED",
        phone: phone,
      },
      "*"
    );
  }

  // Monitor DOM for conversation switches
  function observeChatHeader() {
    const observer = new MutationObserver(() => {
      const phone = extractActivePhone();
      if (phone && phone !== activePhone) {
        activePhone = phone;
        console.log("[WAPI Extension] Active contact detected:", activePhone);
        notifyPanel(activePhone);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Listen for messages from panel (e.g., requests for current phone)
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "WAPI_REQUEST_ACTIVE_PHONE") {
      const phone = extractActivePhone() || activePhone;
      notifyPanel(phone);
    }
  });

  // Initialization after WhatsApp Web UI loads
  function init() {
    injectToggleButton();
    injectSidePanel();
    observeChatHeader();
    setTimeout(() => {
      const phone = extractActivePhone();
      if (phone) {
        activePhone = phone;
        notifyPanel(phone);
      }
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
