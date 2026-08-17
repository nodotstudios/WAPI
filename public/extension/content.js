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
  let observerDebounce = null;

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

  // Extract phone number and name from WhatsApp Web DOM
  function extractActiveContact() {
    try {
      const header = document.querySelector("#main header");
      if (!header) return { phone: null, name: null };

      // Try finding title or contact text
      const titleEl = header.querySelector("span[title]") || header.querySelector("div[role='button'] span");
      const titleText = (titleEl?.getAttribute("title") || titleEl?.textContent || "").trim();
      const titleDigits = titleText.replace(/\D/g, "");

      let phone = titleDigits.length >= 7 ? titleDigits : null;
      let name = titleDigits.length >= 7 ? null : titleText;

      // Check subtext or phone attributes in chat header for secondary digits
      if (!phone) {
        const subtextEl = header.querySelector("span.selectable-text") || header.querySelector("span[dir='auto']");
        if (subtextEl) {
          const subDigits = subtextEl.textContent.replace(/\D/g, "");
          if (subDigits && subDigits.length >= 7) phone = subDigits;
        }
      }

      return { phone: phone || "", name: name || titleText || "" };
    } catch (e) {
      return { phone: null, name: null };
    }
  }

  // Send contact updates to panel iframe
  function notifyPanel(contactData) {
    if (!panelIframe || !panelIframe.contentWindow) return;
    panelIframe.contentWindow.postMessage(
      {
        type: "WAPI_CONTACT_CHANGED",
        phone: contactData.phone || "",
        name: contactData.name || "",
      },
      "*"
    );
  }

  // Monitor DOM for conversation switches with debouncing
  function observeChatHeader() {
    const observer = new MutationObserver(() => {
      if (observerDebounce) clearTimeout(observerDebounce);
      observerDebounce = setTimeout(() => {
        const contact = extractActiveContact();
        const currentId = contact.phone || contact.name;
        if (currentId && currentId !== activePhone) {
          activePhone = currentId;
          notifyPanel(contact);
        }
      }, 150);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Listen for messages from panel
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "WAPI_REQUEST_ACTIVE_PHONE") {
      const contact = extractActiveContact();
      notifyPanel(contact);
    }
  });

  // Initialization after WhatsApp Web UI loads
  function init() {
    injectToggleButton();
    injectSidePanel();
    observeChatHeader();
    setTimeout(() => {
      const contact = extractActiveContact();
      if (contact.phone || contact.name) {
        activePhone = contact.phone || contact.name;
        notifyPanel(contact);
      }
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
