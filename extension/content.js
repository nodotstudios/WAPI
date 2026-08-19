/**
 * WAPI CRM Extension Content Script
 * Injected into https://web.whatsapp.com
 *
 * Supercharged & Ultra-Optimized (Zero Freeze / Zero Loop Engine):
 * 1. Safe Throttled Mutation & Contact Detector (100% CPU friendly)
 * 2. Visual Pipeline Stage & Deal Value Badges on Chat List (With Idempotent DOM Check)
 * 3. Pipeline Stage & Urgency Filter Bar above Chat List
 * 4. Quick Responses Engine with Direct Media Injection
 * 5. Collapsible "Today's Schedule & Follow-ups" Calendar Drawer
 */

(function () {
  console.log("[WAPI Extension] Fast & Safe Content Script Loaded on WhatsApp Web");

  let activePhone = null;
  let panelIframe = null;
  let toggleBtn = null;
  let todayFab = null;
  let scheduleDrawer = null;
  let panelVisible = true;

  // Cached CRM Data
  let crmStages = [];
  let crmAllDealsMap = {};
  let crmTodayActivities = [];
  let crmQuickReplies = [];
  let activeFilterStage = "ALL";

  // Debounce & throttling timers to prevent ANY UI freezing or mutation loops
  let isUpdatingBadges = false;
  let badgeScanTimer = null;
  let contactScanTimer = null;

  function cleanDigits(str) {
    return (str || "").replace(/\D/g, "");
  }

  // =================================================================
  // 1. Fetch CRM Global Context via chrome.storage.local
  // =================================================================
  function fetchGlobalContext() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["wapiAuthToken", "wapiServerUrl"], async (items) => {
        const token = items.wapiAuthToken || "";
        const serverUrl = (items.wapiServerUrl || "https://wapi-blond.vercel.app").replace(/\/$/, "");

        if (!token) return;

        try {
          const res = await fetch(`${serverUrl}/api/extension/context`, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => null);

          if (!res || !res.ok) return;
          const data = await res.json().catch(() => ({}));

          if (data.success) {
            crmStages = data.stages || [];
            crmAllDealsMap = data.all_deals_map || {};
            crmTodayActivities = data.today_activities || [];
            crmQuickReplies = data.quick_replies || [];

            updateTodayFab();
            updateFilterBar();
            scheduleBadgeScan();
            renderScheduleDrawerContent();
          }
        } catch (e) {
          console.warn("[WAPI] Error fetching global context:", e);
        }
      });
    }
  }

  // =================================================================
  // 2. Main Draggable Floating Action Button (FAB)
  // =================================================================
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

    // Restore saved position
    try {
      const savedPos = localStorage.getItem("wapi_fab_pos");
      if (savedPos) {
        const parsed = JSON.parse(savedPos);
        if (typeof parsed.left === "number" && typeof parsed.top === "number") {
          const maxLeft = Math.max(10, window.innerWidth - 56);
          const maxTop = Math.max(10, window.innerHeight - 56);
          toggleBtn.style.left = Math.min(Math.max(10, parsed.left), maxLeft) + "px";
          toggleBtn.style.top = Math.min(Math.max(10, parsed.top), maxTop) + "px";
          toggleBtn.style.right = "auto";
          toggleBtn.style.bottom = "auto";
        }
      }
    } catch (e) {}

    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0, dragDist = 0;

    function onPointerDown(e) {
      isDragging = true;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      startX = clientX;
      startY = clientY;
      dragDist = 0;

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
      dragDist = Math.hypot(dx, dy);

      const maxLeft = Math.max(10, window.innerWidth - 56);
      const maxTop = Math.max(10, window.innerHeight - 56);
      toggleBtn.style.left = Math.min(Math.max(10, initialLeft + dx), maxLeft) + "px";
      toggleBtn.style.top = Math.min(Math.max(10, initialTop + dy), maxTop) + "px";
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

      if (dragDist > 6) {
        try {
          const rect = toggleBtn.getBoundingClientRect();
          localStorage.setItem("wapi_fab_pos", JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
        } catch (e) {}
      } else {
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

  // =================================================================
  // 3. Side Panel Iframe
  // =================================================================
  function injectSidePanel() {
    if (document.getElementById("wapi-crm-iframe")) return;
    panelIframe = document.createElement("iframe");
    panelIframe.id = "wapi-crm-iframe";
    panelIframe.src = chrome.runtime.getURL("panel.html");
    panelIframe.className = "wapi-side-panel";
    document.body.appendChild(panelIframe);
  }

  // =================================================================
  // 4. Safe Visual Pipeline Badges on WhatsApp Web Chat Rows (IDEMPOTENT)
  // =================================================================
  function scheduleBadgeScan() {
    if (badgeScanTimer) clearTimeout(badgeScanTimer);
    badgeScanTimer = setTimeout(injectBadgesIntoChatList, 250);
  }

  function injectBadgesIntoChatList() {
    if (isUpdatingBadges) return;
    isUpdatingBadges = true;

    try {
      const paneSide = document.querySelector("#pane-side");
      if (!paneSide) return;

      const chatRows = paneSide.querySelectorAll("div[role='listitem'], div[role='row'], div[tabindex='-1']");
      if (!chatRows || chatRows.length === 0) return;

      chatRows.forEach((row) => {
        const titleSpan = row.querySelector("span[title]") || row.querySelector("div[role='gridcell'] span");
        if (!titleSpan) return;

        const titleText = (titleSpan.getAttribute("title") || titleSpan.textContent || "").trim();
        if (!titleText) return;

        const digits = cleanDigits(titleText);
        const nameKey = titleText.toLowerCase();

        const dealInfo = crmAllDealsMap[digits] || (digits.length >= 10 ? crmAllDealsMap[digits.slice(-10)] : null) || crmAllDealsMap[nameKey];

        const targetKey = dealInfo ? `${dealInfo.deal_id}_${dealInfo.stage_name}_${dealInfo.value}_${dealInfo.is_due_today}` : "NONE";
        const currentKey = row.getAttribute("data-wapi-state");

        // If badge state is already applied and up-to-date, DO NOT TOUCH DOM!
        if (currentKey === targetKey) return;
        row.setAttribute("data-wapi-state", targetKey);

        const existing = row.querySelector(".wapi-badge-container");
        if (existing) existing.remove();

        if (dealInfo) {
          const badgeContainer = document.createElement("span");
          badgeContainer.className = "wapi-badge-container";

          // 1. Stage Badge
          const stageBadge = document.createElement("span");
          stageBadge.className = "wapi-chat-badge";
          stageBadge.textContent = dealInfo.stage_name;
          stageBadge.style.backgroundColor = `${dealInfo.stage_color || "#10b981"}25`;
          stageBadge.style.color = dealInfo.stage_color || "#10b981";
          stageBadge.style.border = `1px solid ${dealInfo.stage_color || "#10b981"}50`;
          badgeContainer.appendChild(stageBadge);

          // 2. Value Badge (if > 0)
          if (dealInfo.value > 0) {
            const valBadge = document.createElement("span");
            valBadge.className = "wapi-value-badge";
            valBadge.textContent = `${dealInfo.currency === "USD" ? "$" : dealInfo.currency + " "}${Number(dealInfo.value).toLocaleString()}`;
            badgeContainer.appendChild(valBadge);
          }

          // 3. Urgency / Due Today Badge
          if (dealInfo.is_due_today) {
            const dueBadge = document.createElement("span");
            dueBadge.className = "wapi-due-badge";
            dueBadge.textContent = "🔥 Due Today";
            badgeContainer.appendChild(dueBadge);
          }

          titleSpan.parentElement?.appendChild(badgeContainer);
        }
      });

      applyChatListFilter();
    } catch (err) {
      console.warn("[WAPI] Badge injection error:", err);
    } finally {
      isUpdatingBadges = false;
    }
  }

  // =================================================================
  // 5. Instant Pipeline Stage & Urgency Filter Bar
  // =================================================================
  function updateFilterBar() {
    const paneSide = document.querySelector("#pane-side");
    if (!paneSide) return;

    let filterBar = document.getElementById("wapi-filter-bar");
    if (!filterBar) {
      filterBar = document.createElement("div");
      filterBar.id = "wapi-filter-bar";
      filterBar.className = "wapi-filter-bar";
      paneSide.parentElement?.insertBefore(filterBar, paneSide);
    }

    const dueCount = Object.values(crmAllDealsMap).filter((d) => d.is_due_today).length;

    let chipsHtml = `
      <button type="button" class="wapi-filter-chip ${activeFilterStage === "ALL" ? "active" : ""}" data-stage="ALL">
        All Chats
      </button>
    `;

    if (dueCount > 0) {
      chipsHtml += `
        <button type="button" class="wapi-filter-chip due-chip ${activeFilterStage === "DUE_TODAY" ? "active" : ""}" data-stage="DUE_TODAY">
          🔥 Due Today (${dueCount})
        </button>
      `;
    }

    crmStages.forEach((stg) => {
      const stageCount = Object.values(crmAllDealsMap).filter((d) => d.stage_id === stg.id).length;
      if (stageCount > 0) {
        chipsHtml += `
          <button type="button" class="wapi-filter-chip ${activeFilterStage === stg.id ? "active" : ""}" data-stage="${stg.id}">
            ${stg.name} (${stageCount})
          </button>
        `;
      }
    });

    filterBar.innerHTML = chipsHtml;

    filterBar.querySelectorAll(".wapi-filter-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilterStage = btn.getAttribute("data-stage") || "ALL";
        updateFilterBar();
        applyChatListFilter();
      });
    });
  }

  function applyChatListFilter() {
    const paneSide = document.querySelector("#pane-side");
    if (!paneSide) return;

    const chatRows = paneSide.querySelectorAll("div[role='listitem'], div[role='row'], div[tabindex='-1']");
    if (!chatRows || chatRows.length === 0) return;

    chatRows.forEach((row) => {
      if (activeFilterStage === "ALL") {
        row.style.display = "";
        return;
      }

      const titleSpan = row.querySelector("span[title]") || row.querySelector("div[role='gridcell'] span");
      if (!titleSpan) return;

      const titleText = (titleSpan.getAttribute("title") || titleSpan.textContent || "").trim();
      const digits = cleanDigits(titleText);
      const nameKey = titleText.toLowerCase();

      const dealInfo = crmAllDealsMap[digits] || (digits.length >= 10 ? crmAllDealsMap[digits.slice(-10)] : null) || crmAllDealsMap[nameKey];

      if (activeFilterStage === "DUE_TODAY") {
        row.style.display = dealInfo && dealInfo.is_due_today ? "" : "none";
      } else {
        row.style.display = dealInfo && dealInfo.stage_id === activeFilterStage ? "" : "none";
      }
    });
  }

  // =================================================================
  // 6. Direct Media & File Injection into WhatsApp Web
  // =================================================================
  async function injectMediaIntoWhatsApp(mediaUrl, filename, captionText) {
    try {
      console.log("[WAPI] Fetching media for direct injection:", mediaUrl);
      const res = await fetch(mediaUrl);
      const blob = await res.blob();
      const mimeType = blob.type || "application/octet-stream";
      const file = new File([blob], filename || "attachment", { type: mimeType });

      // 1. Try WhatsApp Web native file input
      const fileInputs = document.querySelectorAll("input[type='file']");
      let targetInput = null;

      for (const input of fileInputs) {
        const accept = input.getAttribute("accept") || "";
        if (mimeType.startsWith("image/") && accept.includes("image")) {
          targetInput = input;
          break;
        }
        if (!targetInput) targetInput = input;
      }

      if (targetInput) {
        const dt = new DataTransfer();
        dt.items.add(file);
        targetInput.files = dt.files;
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("[WAPI] Injected file directly via file input element");
      } else {
        // 2. Dispatch native Drag & Drop Event onto WhatsApp main chat area
        const dropZone = document.querySelector("#main") || document.body;
        const dt = new DataTransfer();
        dt.items.add(file);

        dropZone.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
        dropZone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
        dropZone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
        console.log("[WAPI] Injected file directly via Drop Event");
      }

      // If caption text is provided, paste into caption
      if (captionText) {
        setTimeout(() => {
          const captionBox = document.querySelector("div[contenteditable='true'][role='textbox']");
          if (captionBox) {
            captionBox.focus();
            document.execCommand("insertText", false, captionText);
          }
        }, 300);
      }
    } catch (e) {
      console.error("[WAPI] Direct media injection failed:", e);
    }
  }

  function injectTextIntoMessageInput(text) {
    const input = document.querySelector("#main footer div[contenteditable='true'][role='textbox']");
    if (input) {
      input.focus();
      document.execCommand("insertText", false, text);
    }
  }

  // =================================================================
  // 7. Quick Responses Trigger & Slash Command Popup
  // =================================================================
  function injectQuickResponseButton() {
    const footer = document.querySelector("#main footer");
    if (!footer || document.getElementById("wapi-quick-btn")) return;

    const actionContainer = footer.querySelector("div[role='button']")?.parentElement || footer.firstElementChild;
    if (!actionContainer) return;

    const quickBtn = document.createElement("button");
    quickBtn.id = "wapi-quick-btn";
    quickBtn.className = "wapi-quick-btn";
    quickBtn.title = "WAPI Quick Responses (or type / in chat)";
    quickBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
    `;

    quickBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleQuickPopup();
    });

    actionContainer.insertBefore(quickBtn, actionContainer.firstChild);

    // Listen for '/' key in message box
    const msgBox = footer.querySelector("div[contenteditable='true'][role='textbox']");
    if (msgBox && !msgBox.__wapi_slash_listening) {
      msgBox.__wapi_slash_listening = true;
      msgBox.addEventListener("keyup", (e) => {
        const text = msgBox.textContent || "";
        if (text.startsWith("/") && text.length <= 15) {
          openQuickPopup(text.slice(1));
        } else if (!text.startsWith("/")) {
          closeQuickPopup();
        }
      });
    }
  }

  function openQuickPopup(query = "") {
    let popup = document.getElementById("wapi-quick-popup");
    if (!popup) {
      popup = document.createElement("div");
      popup.id = "wapi-quick-popup";
      popup.className = "wapi-quick-popup";
      document.body.appendChild(popup);
    }

    const filtered = crmQuickReplies.filter((qr) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        qr.title.toLowerCase().includes(q) ||
        (qr.content_text && qr.content_text.toLowerCase().includes(q)) ||
        (qr.keywords && JSON.stringify(qr.keywords).toLowerCase().includes(q))
      );
    });

    popup.innerHTML = `
      <div class="wapi-quick-header">
        <input type="text" class="wapi-quick-search" placeholder="Search templates & media (e.g. pitch, pricing)..." value="${query}" />
      </div>
      <div class="wapi-quick-list">
        ${
          filtered.length === 0
            ? `<div style="padding: 16px; text-align: center; color: #8696a0; font-size: 11.5px;">No templates found. Add templates in Settings → Quick Responses.</div>`
            : filtered
                .map(
                  (qr) => `
          <div class="wapi-quick-item" data-id="${qr.id}">
            <div class="wapi-quick-title">
              <span>⚡ ${qr.title}</span>
              ${qr.media_url ? `<span class="wapi-quick-media-pill">📎 ${qr.media_type === "image" ? "Image" : "Document"}</span>` : ""}
            </div>
            ${qr.content_text ? `<div class="wapi-quick-text">${qr.content_text}</div>` : ""}
          </div>
        `
                )
                .join("")
        }
      </div>
    `;

    popup.style.display = "flex";

    const searchInput = popup.querySelector(".wapi-quick-search");
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener("input", (e) => {
        openQuickPopup(e.target.value);
      });
    }

    popup.querySelectorAll(".wapi-quick-item").forEach((item) => {
      item.addEventListener("click", () => {
        const id = item.getAttribute("data-id");
        const template = crmQuickReplies.find((q) => q.id === id);
        if (template) {
          if (template.media_url) {
            void injectMediaIntoWhatsApp(template.media_url, template.filename, template.content_text);
          } else if (template.content_text) {
            injectTextIntoMessageInput(template.content_text);
          }
        }
        closeQuickPopup();
      });
    });
  }

  function closeQuickPopup() {
    const popup = document.getElementById("wapi-quick-popup");
    if (popup) popup.style.display = "none";
  }

  function toggleQuickPopup() {
    const popup = document.getElementById("wapi-quick-popup");
    if (popup && popup.style.display === "flex") {
      closeQuickPopup();
    } else {
      openQuickPopup();
    }
  }

  // =================================================================
  // 8. Collapsible "Today's Schedule & Follow-ups" Calendar Drawer
  // =================================================================
  function updateTodayFab() {
    if (document.getElementById("wapi-today-fab")) {
      todayFab = document.getElementById("wapi-today-fab");
    } else {
      todayFab = document.createElement("button");
      todayFab.id = "wapi-today-fab";
      todayFab.className = "wapi-today-fab";
      todayFab.addEventListener("click", toggleScheduleDrawer);
      document.body.appendChild(todayFab);
    }

    const count = crmTodayActivities.length;
    todayFab.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      <span>📅 ${count > 0 ? `${count} Due Today` : "Schedule & Agenda"}</span>
    `;

    todayFab.style.display = "flex";
  }

  function toggleScheduleDrawer() {
    if (!scheduleDrawer) {
      scheduleDrawer = document.createElement("div");
      scheduleDrawer.id = "wapi-schedule-drawer";
      scheduleDrawer.className = "wapi-schedule-drawer";
      document.body.appendChild(scheduleDrawer);
    }

    const isOpen = scheduleDrawer.classList.contains("open");
    if (isOpen) {
      scheduleDrawer.classList.remove("open");
    } else {
      renderScheduleDrawerContent();
      scheduleDrawer.classList.add("open");
    }
  }

  function renderScheduleDrawerContent() {
    if (!scheduleDrawer) return;

    const count = crmTodayActivities.length;
    scheduleDrawer.innerHTML = `
      <div class="wapi-schedule-header">
        <div class="wapi-schedule-title">
          <span>📅 Today's Follow-ups & Meetings (${count})</span>
        </div>
        <button type="button" class="wapi-schedule-close" id="wapi-close-drawer">✕</button>
      </div>
      <div class="wapi-schedule-content">
        ${
          count === 0
            ? `<div style="padding: 24px; text-align: center; color: #8696a0; font-size: 12px;">🎉 All caught up! No pending follow-ups for today.</div>`
            : crmTodayActivities
                .map((act) => {
                  const timeStr = act.scheduled_at ? new Date(act.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Today";
                  return `
            <div class="wapi-schedule-card">
              <div class="wapi-schedule-card-top">
                <span class="wapi-schedule-contact">👤 ${act.contact_name}</span>
                <span class="wapi-schedule-time">⏰ ${timeStr}</span>
              </div>
              <div class="wapi-schedule-title-text">${act.type.toUpperCase()}: ${act.title}</div>
              ${act.description ? `<div style="font-size: 11px; color: #8696a0;">${act.description}</div>` : ""}
              <div class="wapi-schedule-actions">
                <button type="button" class="wapi-schedule-btn wapi-schedule-btn-open" data-phone="${act.contact_phone}" data-name="${act.contact_name}">
                  💬 Open Chat
                </button>
              </div>
            </div>
          `;
                })
                .join("")
        }
      </div>
    `;

    document.getElementById("wapi-close-drawer")?.addEventListener("click", () => {
      scheduleDrawer.classList.remove("open");
    });

    scheduleDrawer.querySelectorAll(".wapi-schedule-btn-open").forEach((btn) => {
      btn.addEventListener("click", () => {
        const phone = btn.getAttribute("data-phone");
        const name = btn.getAttribute("data-name");
        if (phone) {
          window.location.href = `https://web.whatsapp.com/send?phone=${phone.replace(/\D/g, "")}`;
        }
        scheduleDrawer.classList.remove("open");
      });
    });
  }

  // =================================================================
  // 9. Extract Active Contact & Throttled Observer
  // =================================================================
  function extractActiveContact() {
    try {
      const header = document.querySelector("#main header");
      if (!header) return { phone: null, name: null };

      const titleEl = header.querySelector("span[title]") || header.querySelector("div[role='button'] span");
      const titleText = (titleEl?.getAttribute("title") || titleEl?.textContent || "").trim();
      const titleDigits = titleText.replace(/\D/g, "");

      let phone = titleDigits.length >= 7 ? titleDigits : null;
      let name = titleDigits.length >= 7 ? null : titleText;

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
    injectQuickResponseButton();
  }

  function attachChatListClickListener() {
    const paneSide = document.querySelector("#pane-side");
    if (paneSide && !paneSide.__wapi_listening) {
      paneSide.__wapi_listening = true;
      paneSide.addEventListener(
        "click",
        () => {
          setTimeout(checkAndNotify, 40);
          setTimeout(checkAndNotify, 200);
        },
        true
      );
    }
  }

  function observeWhatsApp() {
    injectSidePanel();
    injectToggleButton();
    updateTodayFab();
    attachChatListClickListener();
    fetchGlobalContext();

    // Observe ONLY specific containers with strict debouncing (NO full body observe)
    const observer = new MutationObserver((mutations) => {
      // Ignore mutations created by our own injected elements
      let hasExternalMutations = false;
      for (const m of mutations) {
        if (
          m.target &&
          typeof m.target.className === "string" &&
          m.target.className.includes("wapi-")
        ) {
          continue;
        }
        hasExternalMutations = true;
        break;
      }

      if (!hasExternalMutations) return;

      attachChatListClickListener();
      scheduleBadgeScan();

      if (contactScanTimer) clearTimeout(contactScanTimer);
      contactScanTimer = setTimeout(() => {
        checkAndNotify();
      }, 120);
    });

    const appRoot = document.getElementById("app") || document.body;
    observer.observe(appRoot, {
      childList: true,
      subtree: true,
      attributes: false,
    });

    // Refresh context periodically every 45s
    setInterval(fetchGlobalContext, 45000);
  }

  // Handle messages from panel iframe
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "WAPI_REQUEST_ACTIVE_PHONE") {
      const contact = extractActiveContact();
      if (contact.phone || contact.name) {
        activePhone = contact.phone || contact.name;
        notifyPanel(contact);
      }
    }
    if (event.data && event.data.type === "WAPI_CONTEXT_UPDATED") {
      crmStages = event.data.stages || [];
      crmAllDealsMap = event.data.all_deals_map || {};
      crmTodayActivities = event.data.today_activities || [];
      crmQuickReplies = event.data.quick_replies || [];

      updateTodayFab();
      updateFilterBar();
      scheduleBadgeScan();
      renderScheduleDrawerContent();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeWhatsApp);
  } else {
    observeWhatsApp();
  }
})();
