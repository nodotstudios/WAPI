/**
 * WAPI CRM Extension Content Script
 * Injected into https://web.whatsapp.com
 * Blazing Fast 0ms Click & Mutation Detection + Moveable Floating WAPI Button
 */

(function () {
  console.log("[WAPI Extension] Fast content script initialized on WhatsApp Web");

  let activePhone = null;
  let panelIframe = null;
  let toggleBtn = null;
  let panelVisible = true;
  let debounceTimer = null;

  // Create & Inject Floating Draggable Toggle Button
  function injectToggleButton() {
    if (document.getElementById("wapi-toggle-btn")) return;

    toggleBtn = document.createElement("button");
    toggleBtn.id = "wapi-toggle-btn";
    toggleBtn.title = "WAPI CRM (Drag anywhere or click to toggle)";
    toggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
      </svg>
    `;
    toggleBtn.className = "wapi-fab-button";

    // Restore saved position if available
    try {
      const savedPos = localStorage.getItem("wapi_fab_pos");
      if (savedPos) {
        const parsed = JSON.parse(savedPos);
        if (typeof parsed.left === "number" && typeof parsed.top === "number") {
          const maxLeft = Math.max(10, window.innerWidth - 56);
          const maxTop = Math.max(10, window.innerHeight - 56);
          const safeLeft = Math.min(Math.max(10, parsed.left), maxLeft);
          const safeTop = Math.min(Math.max(10, parsed.top), maxTop);
          toggleBtn.style.left = safeLeft + "px";
          toggleBtn.style.top = safeTop + "px";
          toggleBtn.style.right = "auto";
          toggleBtn.style.bottom = "auto";
        }
      }
    } catch (e) {}

    // Implement Dragging and Click Handling
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let dragDistance = 0;

    function onPointerDown(e) {
      isDragging = true;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      startX = clientX;
      startY = clientY;
      dragDistance = 0;

      const rect = toggleBtn.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      toggleBtn.style.transition = "none";
      document.addEventListener("mousemove", onPointerMove);
      document.addEventListener("mouseup", onPointerUp);
      document.addEventListener("touchmove", onPointerMove, { passive: false });
      document.addEventListener("touchend", onPointerUp);
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault();

      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const dx = clientX - startX;
      const dy = clientY - startY;
      dragDistance = Math.hypot(dx, dy);

      const maxLeft = Math.max(10, window.innerWidth - 56);
      const maxTop = Math.max(10, window.innerHeight - 56);

      const newLeft = Math.min(Math.max(10, initialLeft + dx), maxLeft);
      const newTop = Math.min(Math.max(10, initialTop + dy), maxTop);

      toggleBtn.style.left = newLeft + "px";
      toggleBtn.style.top = newTop + "px";
      toggleBtn.style.right = "auto";
      toggleBtn.style.bottom = "auto";
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      toggleBtn.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";

      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", onPointerUp);
      document.removeEventListener("touchmove", onPointerMove);
      document.removeEventListener("touchend", onPointerUp);

      if (dragDistance > 6) {
        // Saved dragged position
        try {
          const rect = toggleBtn.getBoundingClientRect();
          localStorage.setItem(
            "wapi_fab_pos",
            JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) })
          );
        } catch (e) {}
      } else {
        // User clicked (not dragged) -> Toggle Panel
        panelVisible = !panelVisible;
        if (panelIframe) {
          panelIframe.style.display = panelVisible ? "block" : "none";
        }
      }
    }

    toggleBtn.addEventListener("mousedown", onPointerDown);
    toggleBtn.addEventListener("touchstart", onPointerDown, { passive: false });

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

      // 1. Try finding title or contact text in header
      const titleEl = header.querySelector("span[title]") || header.querySelector("div[role='button'] span");
      const titleText = (titleEl?.getAttribute("title") || titleEl?.textContent || "").trim();
      const titleDigits = titleText.replace(/\D/g, "");

      let phone = titleDigits.length >= 7 ? titleDigits : null;
      let name = titleDigits.length >= 7 ? null : titleText;

      // 2. Check subtext or phone attributes in chat header
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

  function checkAndNotify() {
    const contact = extractActiveContact();
    const currentId = contact.phone || contact.name;
    if (currentId && currentId !== activePhone) {
      activePhone = currentId;
      notifyPanel(contact);
    }
  }

  // Listen for direct clicks on the WhatsApp chat list container (#pane-side)
  function attachChatListClickListener() {
    const paneSide = document.querySelector("#pane-side");
    if (paneSide && !paneSide.__wapi_listening) {
      paneSide.__wapi_listening = true;
      paneSide.addEventListener(
        "click",
        () => {
          setTimeout(checkAndNotify, 30);
          setTimeout(checkAndNotify, 150);
        },
        true
      );
    }
  }

  // Observe chat switching
  function observeWhatsApp() {
    injectSidePanel();
    injectToggleButton();
    attachChatListClickListener();

    // Lightweight observer focused exclusively on header mutations
    const observer = new MutationObserver(() => {
      attachChatListClickListener();

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        checkAndNotify();
      }, 50);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }

  // Handle messages from the iframe panel
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "WAPI_REQUEST_ACTIVE_PHONE") {
      const contact = extractActiveContact();
      if (contact.phone || contact.name) {
        activePhone = contact.phone || contact.name;
        notifyPanel(contact);
      }
    }
  });

  // Start observing once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeWhatsApp);
  } else {
    observeWhatsApp();
  }
})();
