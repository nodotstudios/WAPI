/**
 * WAPI Extension Side-Panel Controller
 * Ultra-Fast Direct Sync + In-Memory Caching + Multi-Offer Sales CRM + Offering Templates & Edit
 */

let serverUrl = "https://wapi-blond.vercel.app";
let authToken = "";
let currentUser = null;

let currentPhone = "";
let currentName = "";
let currentContact = null;
let currentDeals = [];
let stagesList = [];
let offeringsList = [];
let fetchAbortController = null;

// High-speed In-Memory Client Cache (phone/name -> { contact, deals, activities, timestamp })
const contactCache = new Map();

// DOM Elements - Auth & Views
const viewLogin = document.getElementById("view-login");
const viewCrm = document.getElementById("view-crm");
const userDisplay = document.getElementById("user-display");
const btnLogout = document.getElementById("btn-logout");

const loginUrlInput = document.getElementById("login-url");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const btnLogin = document.getElementById("btn-login");
const loginError = document.getElementById("login-error");

// DOM Elements - Contact & CRM
const cAvatar = document.getElementById("c-avatar");
const cName = document.getElementById("c-name");
const cPhone = document.getElementById("c-phone");

// DOM Elements - New Offer Creator
const btnToggleNewOffer = document.getElementById("btn-toggle-new-offer");
const newOfferBox = document.getElementById("new-offer-box");
const newOfferTemplate = document.getElementById("new-offer-template");
const newOfferTitle = document.getElementById("new-offer-title");
const newOfferValue = document.getElementById("new-offer-value");
const newOfferCurrency = document.getElementById("new-offer-currency");
const newOfferStage = document.getElementById("new-offer-stage");
const btnSaveNewOffer = document.getElementById("btn-save-new-offer");
const btnCancelNewOffer = document.getElementById("btn-cancel-new-offer");

// DOM Elements - Edit Offer Box
const editOfferBox = document.getElementById("edit-offer-box");
const editOfferId = document.getElementById("edit-offer-id");
const editOfferBadge = document.getElementById("edit-offer-badge");
const editOfferTemplate = document.getElementById("edit-offer-template");
const editOfferTitle = document.getElementById("edit-offer-title");
const editOfferValue = document.getElementById("edit-offer-value");
const editOfferCurrency = document.getElementById("edit-offer-currency");
const editOfferStage = document.getElementById("edit-offer-stage");
const btnSaveEditOffer = document.getElementById("btn-save-edit-offer");
const btnCancelEditOffer = document.getElementById("btn-cancel-edit-offer");

const offersList = document.getElementById("offers-list");

// DOM Elements - Schedule Activity
const fuChannel = document.getElementById("fu-channel");
const fuDealSelect = document.getElementById("fu-deal-select");
const fuTime = document.getElementById("fu-time");
const fuTitle = document.getElementById("fu-title");
const btnSaveFollowup = document.getElementById("btn-save-followup");

const timelineList = document.getElementById("timeline-list");

// Helper to get request headers with Auth Token
function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken.trim()}`;
  }
  return headers;
}

// Switch between Login and CRM views
function renderView(isLoggedIn) {
  if (isLoggedIn && currentUser) {
    viewLogin.style.display = "none";
    viewCrm.style.display = "block";
    userDisplay.textContent = currentUser.name || currentUser.email || "Online";
    btnLogout.style.display = "inline-block";
  } else {
    viewLogin.style.display = "block";
    viewCrm.style.display = "none";
    userDisplay.textContent = "Offline";
    btnLogout.style.display = "none";
  }
}

// Load stored session on startup
function initSession() {
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["wapiAuthToken", "wapiUser", "wapiServerUrl", "wapiStages", "wapiOfferings"], (items) => {
      if (items.wapiServerUrl) {
        serverUrl = items.wapiServerUrl.replace(/\/$/, "");
        loginUrlInput.value = serverUrl;
      }
      if (items.wapiStages && Array.isArray(items.wapiStages)) {
        stagesList = items.wapiStages;
      }
      if (items.wapiOfferings && Array.isArray(items.wapiOfferings)) {
        offeringsList = items.wapiOfferings;
        populateTemplateSelectors();
      }
      if (items.wapiAuthToken && items.wapiUser) {
        authToken = items.wapiAuthToken;
        currentUser = items.wapiUser;
        renderView(true);
      } else {
        renderView(false);
      }
    });
  }
}

// Handle User Login
btnLogin.addEventListener("click", async () => {
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value.trim();
  const urlVal = loginUrlInput.value.trim();

  if (!email || !password) {
    loginError.textContent = "Please enter your email and password.";
    loginError.style.display = "block";
    return;
  }

  if (urlVal) {
    serverUrl = urlVal.replace(/\/$/, "");
  }

  btnLogin.textContent = "Signing In...";
  btnLogin.disabled = true;
  loginError.style.display = "none";

  try {
    const res = await fetch(`${serverUrl}/api/extension/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.token) {
      throw new Error(data.error || "Invalid login credentials. Please try again.");
    }

    authToken = data.token;
    currentUser = data.user;

    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        wapiAuthToken: authToken,
        wapiUser: currentUser,
        wapiServerUrl: serverUrl,
      });
    }

    renderView(true);
    fetchCrmContext(currentPhone, currentName);
  } catch (err) {
    console.error("[WAPI Extension] Login error:", err);
    loginError.textContent = err.message || "Failed to sign in. Check credentials.";
    loginError.style.display = "block";
  } finally {
    btnLogin.textContent = "Sign In to WAPI";
    btnLogin.disabled = false;
  }
});

// Handle Sign Out
btnLogout.addEventListener("click", () => {
  authToken = "";
  currentUser = null;
  currentContact = null;
  currentDeals = [];
  contactCache.clear();

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.remove(["wapiAuthToken", "wapiUser"]);
  }

  renderView(false);
});

// Populate Template Dropdowns
function populateTemplateSelectors() {
  const templateOptions = `<option value="">-- Custom Offer (No Template) --</option>` +
    offeringsList.map((o) => `<option value="${o.id}">${o.title} (${o.currency || "$"}${o.value || 0})</option>`).join("");

  newOfferTemplate.innerHTML = templateOptions;
  editOfferTemplate.innerHTML = `<option value="">-- Keep Current / Custom --</option>` +
    offeringsList.map((o) => `<option value="${o.id}">${o.title} (${o.currency || "$"}${o.value || 0})</option>`).join("");
}

// Handle Template Selection on New Offer
newOfferTemplate.addEventListener("change", (e) => {
  const selectedId = e.target.value;
  if (!selectedId) return;
  const match = offeringsList.find((o) => o.id === selectedId);
  if (match) {
    newOfferTitle.value = match.title || "";
    newOfferValue.value = match.value || "0";
    if (match.currency) newOfferCurrency.value = match.currency;
  }
});

// Handle Template Selection on Edit Offer
editOfferTemplate.addEventListener("change", (e) => {
  const selectedId = e.target.value;
  if (!selectedId) return;
  const match = offeringsList.find((o) => o.id === selectedId);
  if (match) {
    editOfferTitle.value = match.title || "";
    editOfferValue.value = match.value || "0";
    if (match.currency) editOfferCurrency.value = match.currency;
  }
});

// Toggle New Offer Creator Box
btnToggleNewOffer.addEventListener("click", () => {
  editOfferBox.style.display = "none";
  const isVisible = newOfferBox.style.display === "block";
  newOfferBox.style.display = isVisible ? "none" : "block";
  if (!isVisible) {
    newOfferTitle.focus();
  }
});

btnCancelNewOffer.addEventListener("click", () => {
  newOfferBox.style.display = "none";
  newOfferTitle.value = "";
  newOfferValue.value = "0";
  newOfferTemplate.value = "";
});

// Cancel Edit Offer
btnCancelEditOffer.addEventListener("click", () => {
  editOfferBox.style.display = "none";
  editOfferId.value = "";
});

// Create New Lead / Offer (Auto-creates contact if not in CRM)
btnSaveNewOffer.addEventListener("click", async () => {
  if (!authToken) {
    alert("Please sign in first.");
    return;
  }

  const title = newOfferTitle.value.trim() || "New Client Offer";
  const value = parseFloat(newOfferValue.value) || 0;
  const currency = newOfferCurrency.value || "USD";
  const stage_id = newOfferStage.value || (stagesList[0]?.id ?? undefined);

  btnSaveNewOffer.textContent = "Creating...";
  btnSaveNewOffer.disabled = true;

  try {
    const res = await fetch(`${serverUrl}/api/extension/deal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        contact_id: currentContact?.id || undefined,
        phone: currentPhone || undefined,
        name: currentName || undefined,
        title,
        value,
        currency,
        stage_id,
        status: "open",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create deal");
    }

    const resData = await res.json();
    if (resData.deal?.contact) {
      currentContact = resData.deal.contact;
    }

    newOfferBox.style.display = "none";
    newOfferTitle.value = "";
    newOfferValue.value = "0";
    newOfferTemplate.value = "";

    // Invalidate local cache for this contact
    const cacheKey = currentPhone || currentName;
    if (cacheKey) contactCache.delete(cacheKey);

    // Refresh context immediately
    await fetchCrmContext(currentPhone, currentName, false);
  } catch (err) {
    alert("Error creating offer: " + err.message);
  } finally {
    btnSaveNewOffer.textContent = "Create Offer";
    btnSaveNewOffer.disabled = false;
  }
});

// Save Edited Offer
btnSaveEditOffer.addEventListener("click", async () => {
  const dealId = editOfferId.value;
  if (!dealId || !authToken) return;

  const title = editOfferTitle.value.trim() || "Offer";
  const value = parseFloat(editOfferValue.value) || 0;
  const currency = editOfferCurrency.value || "USD";
  const stage_id = editOfferStage.value;

  btnSaveEditOffer.textContent = "Saving...";
  btnSaveEditOffer.disabled = true;

  // 1. Optimistic Update in UI & memory
  const dealIdx = currentDeals.findIndex((d) => d.id === dealId);
  if (dealIdx !== -1) {
    currentDeals[dealIdx] = {
      ...currentDeals[dealIdx],
      title,
      value,
      currency,
      stage_id,
    };
    renderOffers(currentDeals);
    populateStageAndDealSelectors();
  }

  editOfferBox.style.display = "none";

  // 2. Send update to backend
  try {
    const res = await fetch(`${serverUrl}/api/extension/deal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        deal_id: dealId,
        title,
        value,
        currency,
        stage_id,
      }),
    });

    if (!res.ok) {
      throw new Error("Failed to save changes to server");
    }

    // Invalidate cache and update
    const cacheKey = currentPhone || currentName;
    if (cacheKey && contactCache.has(cacheKey)) {
      const cached = contactCache.get(cacheKey);
      cached.deals = currentDeals;
    }
  } catch (err) {
    alert("Error updating offer: " + err.message);
  } finally {
    btnSaveEditOffer.textContent = "Save Changes";
    btnSaveEditOffer.disabled = false;
  }
});

// Open Edit Offer Box
function openEditOfferModal(dealId) {
  const deal = currentDeals.find((d) => d.id === dealId);
  if (!deal) return;

  newOfferBox.style.display = "none";
  editOfferId.value = deal.id;
  editOfferTitle.value = deal.title || "";
  editOfferValue.value = deal.value || "0";
  editOfferCurrency.value = deal.currency || "USD";
  editOfferBadge.textContent = (deal.status || "OPEN").toUpperCase();
  editOfferBadge.className = `badge ${deal.status === "won" ? "badge-won" : deal.status === "lost" ? "badge-lost" : "badge-open"}`;

  // Populate Edit Stage Dropdown
  editOfferStage.innerHTML = stagesList
    .map((s) => `<option value="${s.id}" ${deal.stage_id === s.id ? "selected" : ""}>${s.name}</option>`)
    .join("");

  editOfferTemplate.value = "";
  editOfferBox.style.display = "block";
  editOfferTitle.focus();
}

/**
 * Fetch CRM Context for WhatsApp Chat
 * Ultra-Fast Direct Sync with In-Memory Caching & Stale-While-Revalidate Pattern
 */
async function fetchCrmContext(phone, name, useCache = true) {
  currentPhone = phone || "";
  currentName = name || "";

  if (!authToken) {
    renderContactHeader(null, name, phone);
    return;
  }

  const cacheKey = currentPhone || currentName;

  // 1. INSTANT 0ms MEMORY CACHE HIT (Stale-While-Revalidate)
  if (useCache && cacheKey && contactCache.has(cacheKey)) {
    const cached = contactCache.get(cacheKey);
    currentContact = cached.contact;
    currentDeals = cached.deals || [];
    renderContactHeader(cached.contact, currentName, currentPhone);
    renderOffers(cached.deals);
    renderTimeline(cached.activities);
    populateStageAndDealSelectors();
  } else if (!contactCache.has(cacheKey)) {
    // Brand new contact: immediately render header with contact details without lag
    currentContact = null;
    currentDeals = [];
    renderContactHeader(null, currentName, currentPhone);
    renderOffers([]);
    renderTimeline([]);
  }

  // Cancel any in-flight request for previous chats
  if (fetchAbortController) {
    fetchAbortController.abort();
  }
  fetchAbortController = new AbortController();

  // 2. BACKGROUND REVALIDATION / FAST SERVER SYNC
  try {
    const params = new URLSearchParams();
    if (phone) params.set("phone", phone);
    if (name) params.set("name", name);

    const res = await fetch(`${serverUrl}/api/extension/context?${params.toString()}`, {
      method: "GET",
      headers: getAuthHeaders(),
      signal: fetchAbortController.signal,
    });

    if (!res.ok) {
      if (res.status === 401) {
        authToken = "";
        currentUser = null;
        renderView(false);
      }
      return;
    }

    const data = await res.json();

    // Cache stages and offerings globally
    if (data.stages && Array.isArray(data.stages)) {
      stagesList = data.stages;
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ wapiStages: stagesList });
      }
    }
    if (data.offerings && Array.isArray(data.offerings)) {
      offeringsList = data.offerings;
      populateTemplateSelectors();
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ wapiOfferings: offeringsList });
      }
    }

    currentContact = data.contact || null;
    currentDeals = data.deals || [];

    // Save fresh data into in-memory cache
    if (cacheKey) {
      contactCache.set(cacheKey, {
        contact: currentContact,
        deals: currentDeals,
        activities: data.activities || [],
        timestamp: Date.now(),
      });
    }

    // Refresh UI with verified server state
    renderContactHeader(currentContact, currentName, currentPhone);
    renderOffers(currentDeals);
    renderTimeline(data.activities || []);
    populateStageAndDealSelectors();
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error("[WAPI Extension] Context fetch error:", err);
  }
}

function renderContactHeader(contact, fallbackName, fallbackPhone) {
  if (contact) {
    cName.textContent = contact.name || fallbackName || `Contact (${(contact.phone || "").slice(-4)})`;
    cPhone.textContent = contact.phone || fallbackPhone || "";
    cAvatar.textContent = (cName.textContent || "C").charAt(0).toUpperCase();
  } else {
    cName.textContent = fallbackName || "Select a Chat";
    cPhone.textContent = fallbackPhone || "Click any conversation in WhatsApp Web";
    cAvatar.textContent = "?";
  }
}

function populateStageAndDealSelectors() {
  // Populate New Offer Stage Dropdown
  if (stagesList && stagesList.length > 0) {
    newOfferStage.innerHTML = stagesList
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join("");
  }

  // Populate Follow-up Deal selector
  fuDealSelect.innerHTML = `<option value="">General Client Activity</option>` +
    currentDeals
      .map((d) => `<option value="${d.id}">${d.title || "Offer"} (${d.currency || "$"}${d.value || 0})</option>`)
      .join("");
}

// Render All Client Offers / Deals with Edit & Delete Buttons
function renderOffers(deals) {
  if (!deals || deals.length === 0) {
    offersList.innerHTML = `
      <div style="color: #64748b; font-size: 11px; padding: 6px 0;">
        No active offers for this client yet.<br>Click <strong>+ New Lead / Offer</strong> above to create one.
      </div>
    `;
    return;
  }

  offersList.innerHTML = deals
    .map((deal) => {
      const isWon = deal.status === "won";
      const isLost = deal.status === "lost";
      const badgeClass = isWon ? "badge badge-won" : isLost ? "badge badge-lost" : "badge badge-open";

      const stageOptions = stagesList
        .map(
          (s) => `<option value="${s.id}" ${deal.stage_id === s.id ? "selected" : ""}>${s.name}</option>`
        )
        .join("");

      return `
        <div class="offer-card" id="offer-card-${deal.id}" data-deal-id="${deal.id}">
          <div class="offer-header">
            <span class="offer-title">${deal.title || "Offer / Deal"}</span>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span class="${badgeClass}">${(deal.status || "OPEN").toUpperCase()}</span>
              <button class="btn-edit-offer" data-deal-id="${deal.id}" title="Edit offer">
                ✏️
              </button>
              <button class="btn-delete-offer" data-deal-id="${deal.id}" title="Delete offer">
                🗑️
              </button>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span class="offer-value">${deal.currency || "USD"} ${(deal.value || 0).toLocaleString()}</span>
            <span style="font-size: 10px; color: #64748b;">${new Date(deal.created_at).toLocaleDateString()}</span>
          </div>

          <label style="margin-top: 4px;">Pipeline Stage</label>
          <select class="deal-stage-select" data-deal-id="${deal.id}" style="margin-bottom: 8px;">
            ${stageOptions}
          </select>

          <div class="flex-row">
            <button class="btn btn-won btn-mark-won-offer" data-deal-id="${deal.id}" style="flex: 1;">
              ${isWon ? "🏆 Won ✓" : "🏆 Mark Won"}
            </button>
            <button class="btn btn-lost btn-mark-lost-offer" data-deal-id="${deal.id}" style="flex: 1;">
              ${isLost ? "Lost ❌" : "Mark Lost"}
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  // Attach Stage Change listeners
  document.querySelectorAll(".deal-stage-select").forEach((select) => {
    select.addEventListener("change", async (e) => {
      const dealId = e.target.getAttribute("data-deal-id");
      const newStageId = e.target.value;
      await updateDealStage(dealId, newStageId);
    });
  });

  // Attach Edit Offer listeners
  document.querySelectorAll(".btn-edit-offer").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dealId = btn.getAttribute("data-deal-id");
      openEditOfferModal(dealId);
    });
  });

  // Attach Mark Won listeners
  document.querySelectorAll(".btn-mark-won-offer").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dealId = btn.getAttribute("data-deal-id");
      btn.textContent = "Processing...";
      await updateDealStatus(dealId, "won");
    });
  });

  // Attach Mark Lost listeners
  document.querySelectorAll(".btn-mark-lost-offer").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dealId = btn.getAttribute("data-deal-id");
      btn.textContent = "Processing...";
      await updateDealStatus(dealId, "lost");
    });
  });

  // Attach Delete Offer listeners
  document.querySelectorAll(".btn-delete-offer").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dealId = btn.getAttribute("data-deal-id");
      if (!confirm("Are you sure you want to delete this offer?")) return;
      await deleteDeal(dealId);
    });
  });
}

// Delete Offer from CRM and UI (0ms Optimistic Removal)
async function deleteDeal(dealId) {
  const card = document.getElementById(`offer-card-${dealId}`);
  if (card) card.remove();

  const cacheKey = currentPhone || currentName;
  if (cacheKey && contactCache.has(cacheKey)) {
    const cached = contactCache.get(cacheKey);
    cached.deals = (cached.deals || []).filter((d) => d.id !== dealId);
  }

  currentDeals = currentDeals.filter((d) => d.id !== dealId);
  populateStageAndDealSelectors();

  if (currentDeals.length === 0) {
    renderOffers([]);
  }

  try {
    await fetch(`${serverUrl}/api/extension/deal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        deal_id: dealId,
        action: "delete",
      }),
    });
  } catch (err) {
    console.error("Failed to delete deal on server:", err);
  }
}

// Update Stage of a specific offer
async function updateDealStage(dealId, stageId) {
  const cacheKey = currentPhone || currentName;
  if (cacheKey) contactCache.delete(cacheKey);

  try {
    const res = await fetch(`${serverUrl}/api/extension/deal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        deal_id: dealId,
        stage_id: stageId,
      }),
    });

    if (res.ok) {
      const deal = currentDeals.find((d) => d.id === dealId);
      if (deal) deal.stage_id = stageId;
    }
  } catch (err) {
    console.error("Failed to update deal stage:", err);
  }
}

// Update Deal Status (Won / Lost / Open) with Meta CAPI trigger
async function updateDealStatus(dealId, status) {
  const cacheKey = currentPhone || currentName;
  if (cacheKey) contactCache.delete(cacheKey);

  try {
    const res = await fetch(`${serverUrl}/api/extension/deal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        deal_id: dealId,
        status: status,
      }),
    });

    if (!res.ok) throw new Error("Failed to update deal status");

    await fetchCrmContext(currentPhone, currentName, false);
  } catch (err) {
    alert("Error updating status: " + err.message);
  }
}

// Render Timeline Activities
function renderTimeline(activities) {
  if (!activities || activities.length === 0) {
    timelineList.innerHTML = `<div style="color: #64748b; font-size: 11px;">No activities recorded yet.</div>`;
    return;
  }

  timelineList.innerHTML = activities
    .map(
      (a) => `
    <div class="timeline-item">
      <div class="timeline-title">${a.title || "CRM Event"}</div>
      <div class="timeline-time">${new Date(a.scheduled_at || a.created_at).toLocaleDateString()} — ${(a.status || "COMPLETED").toUpperCase()}</div>
      ${a.description ? `<div style="color: #cbd5e1; margin-top: 2px;">${a.description}</div>` : ""}
    </div>
  `
    )
    .join("");
}

// Save Follow-up / Activity (Syncs to CRM + Google Calendar)
btnSaveFollowup.addEventListener("click", async () => {
  if (!authToken) return;

  btnSaveFollowup.textContent = "Saving to CRM...";
  btnSaveFollowup.disabled = true;

  try {
    const channel = fuChannel.value;
    const dealId = fuDealSelect.value || null;

    const body = {
      deal_id: dealId,
      contact_id: currentContact?.id || undefined,
      phone: currentPhone || undefined,
      name: currentName || undefined,
      type: channel,
      title: fuTitle.value.trim() || `Scheduled Follow-up via ${channel}`,
      scheduled_at: fuTime.value ? new Date(fuTime.value).toISOString() : new Date().toISOString(),
    };

    const res = await fetch(`${serverUrl}/api/extension/activity`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      btnSaveFollowup.textContent = "Saved to CRM & Calendar ✓";
      fuTitle.value = "";
      setTimeout(() => (btnSaveFollowup.textContent = "Save Activity to CRM & Calendar"), 2000);

      // Invalidate cache and reload
      const cacheKey = currentPhone || currentName;
      if (cacheKey) contactCache.delete(cacheKey);
      fetchCrmContext(currentPhone, currentName, false);
    } else {
      btnSaveFollowup.textContent = "Failed ❌";
      setTimeout(() => (btnSaveFollowup.textContent = "Save Activity to CRM & Calendar"), 2000);
    }
  } catch (err) {
    btnSaveFollowup.textContent = "Failed ❌";
    setTimeout(() => (btnSaveFollowup.textContent = "Save Activity to CRM & Calendar"), 2000);
  } finally {
    btnSaveFollowup.disabled = false;
  }
});

// Listen for contact change events from content script
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "WAPI_CONTACT_CHANGED") {
    fetchCrmContext(event.data.phone, event.data.name, true);
  }
});

// Initialize on load
initSession();
setTimeout(() => {
  window.parent.postMessage({ type: "WAPI_REQUEST_ACTIVE_PHONE" }, "*");
}, 500);
