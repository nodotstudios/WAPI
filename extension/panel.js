/**
 * WAPI Extension Side-Panel Controller
 * Ultra-Fast Direct Sync + In-Memory Caching + Multi-Offer Sales CRM
 */

let serverUrl = "https://wapi-blond.vercel.app";
let authToken = "";
let currentUser = null;

let currentPhone = "";
let currentName = "";
let currentContact = null;
let currentDeals = [];
let stagesList = [];
let fetchAbortController = null;

// High-speed In-Memory Client Cache (phone/name -> { contact, deals, activities, timestamp })
const contactCache = new Map();

// DOM Elements - Auth & Views
const viewLogin = document.getElementById("view-login");
const viewCrm = document.getElementById("view-crm");
const authStatusContainer = document.getElementById("auth-status-container");
const userDisplayName = document.getElementById("user-display-name");
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
const newOfferTitle = document.getElementById("new-offer-title");
const newOfferValue = document.getElementById("new-offer-value");
const newOfferCurrency = document.getElementById("new-offer-currency");
const newOfferStage = document.getElementById("new-offer-stage");
const btnSaveNewOffer = document.getElementById("btn-save-new-offer");
const btnCancelNewOffer = document.getElementById("btn-cancel-new-offer");

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
    authStatusContainer.style.display = "block";
    userDisplayName.textContent = currentUser.name || currentUser.email || "Logged In";
  } else {
    viewLogin.style.display = "block";
    viewCrm.style.display = "none";
    authStatusContainer.style.display = "none";
  }
}

// Load stored session on startup
function initSession() {
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["wapiAuthToken", "wapiUser", "wapiServerUrl", "wapiStages"], (items) => {
      if (items.wapiServerUrl) {
        serverUrl = items.wapiServerUrl.replace(/\/$/, "");
        loginUrlInput.value = serverUrl;
      }
      if (items.wapiStages && Array.isArray(items.wapiStages)) {
        stagesList = items.wapiStages;
      }
      if (items.wapiAuthToken && items.wapiUser) {
        authToken = items.wapiAuthToken;
        currentUser = items.wapiUser;
        renderView(true);
      } else {
        renderView(false);
      }
    });
  } else {
    renderView(false);
  }
}

// Handle Sign In with Email & Password
btnLogin.addEventListener("click", async () => {
  const url = loginUrlInput.value.trim().replace(/\/$/, "") || "https://wapi-blond.vercel.app";
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  loginError.style.display = "none";
  loginError.textContent = "";

  if (!email || !password) {
    loginError.textContent = "Please enter both email and password.";
    loginError.style.display = "block";
    return;
  }

  btnLogin.textContent = "Signing In...";
  btnLogin.disabled = true;

  try {
    const res = await fetch(`${url}/api/extension/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.token) {
      throw new Error(data.error || `Login failed (${res.status})`);
    }

    serverUrl = url;
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

// Toggle New Offer Creator Box
btnToggleNewOffer.addEventListener("click", () => {
  if (!currentContact) return;
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
});

// Create New Lead / Offer
btnSaveNewOffer.addEventListener("click", async () => {
  if (!currentContact || !authToken) return;

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
        contact_id: currentContact.id,
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

    newOfferBox.style.display = "none";
    newOfferTitle.value = "";
    newOfferValue.value = "0";

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

// Fetch CRM Context for Active Contact with Fast Memory Caching
async function fetchCrmContext(phone, name, allowCached = true) {
  currentPhone = phone || "";
  currentName = name || "";

  if (!authToken) return;

  const cacheKey = currentPhone || currentName;

  // 1. Instant Render from In-Memory Cache (0ms)
  if (allowCached && cacheKey && contactCache.has(cacheKey)) {
    const cached = contactCache.get(cacheKey);
    currentContact = cached.contact;
    currentDeals = cached.deals || [];
    renderContactHeader(cached.contact, currentName, currentPhone);
    renderOffers(currentDeals);
    renderTimeline(cached.activities || []);
    populateStageAndDealSelectors();
  } else {
    // Render optimistic name & phone instantly
    if (currentName || currentPhone) {
      cName.textContent = currentName || `Contact (${currentPhone.slice(-4)})`;
      cPhone.textContent = currentPhone || "Syncing...";
      cAvatar.textContent = (currentName || currentPhone || "C").charAt(0).toUpperCase();

      offersList.innerHTML = `
        <div style="color: #94a3b8; font-size: 11px; padding: 10px 0; text-align: center;">
          <span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 4px;">⚡</span>
          Syncing offers...
        </div>
      `;
    }
  }

  if (fetchAbortController) {
    fetchAbortController.abort();
  }
  fetchAbortController = new AbortController();

  try {
    const params = new URLSearchParams();
    if (currentPhone) params.set("phone", currentPhone);
    if (currentName) params.set("name", currentName);

    const res = await fetch(`${serverUrl}/api/extension/context?${params.toString()}`, {
      headers: getAuthHeaders(),
      signal: fetchAbortController.signal,
    });

    if (!res.ok) {
      if (res.status === 401) {
        authToken = "";
        currentUser = null;
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove(["wapiAuthToken", "wapiUser"]);
        }
        renderView(false);
        return;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    currentContact = data.contact;
    currentDeals = data.deals || [];
    if (data.stages && data.stages.length > 0) {
      stagesList = data.stages;
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ wapiStages: stagesList });
      }
    }

    // Save to fast in-memory cache
    if (cacheKey) {
      contactCache.set(cacheKey, {
        contact: currentContact,
        deals: currentDeals,
        activities: data.activities || [],
        timestamp: Date.now(),
      });
    }

    // Render Contact Header
    renderContactHeader(currentContact, currentName, currentPhone);

    // Populate selectors
    populateStageAndDealSelectors();

    // Render Offers List
    renderOffers(currentDeals);

    // Render Timeline Activities
    renderTimeline(data.activities || []);
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error("[WAPI Extension] Fetch context error:", err);
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

// Render All Client Offers / Deals with Delete Button
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
      const badgeClass = isWon ? "badge badge-won" : isLost ? "badge badge-lost" : "badge";

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
              <button class="btn btn-delete btn-delete-offer" data-deal-id="${deal.id}" title="Delete offer">
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

  // Attach Mark Won listeners
  document.querySelectorAll(".btn-mark-won-offer").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const dealId = btn.getAttribute("data-deal-id");
      btn.textContent = "Processing...";
      await updateDealStatus(dealId, "won");
    });
  });

  // Attach Mark Lost listeners
  document.querySelectorAll(".btn-mark-lost-offer").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const dealId = btn.getAttribute("data-deal-id");
      btn.textContent = "Processing...";
      await updateDealStatus(dealId, "lost");
    });
  });

  // Attach Delete Offer listeners
  document.querySelectorAll(".btn-delete-offer").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const dealId = btn.getAttribute("data-deal-id");
      if (!confirm("Are you sure you want to delete this offer?")) return;
      await deleteDeal(dealId);
    });
  });
}

// Delete Offer from CRM and UI (0ms Optimistic Removal)
async function deleteDeal(dealId) {
  // 1. Optimistically remove from DOM
  const card = document.getElementById(`offer-card-${dealId}`);
  if (card) card.remove();

  // 2. Remove from local memory cache
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

  // 3. Send delete request to backend
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
  // Invalidate local cache
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
      await fetchCrmContext(currentPhone, currentName, false);
    }
  } catch (err) {
    console.error("Failed to update deal stage:", err);
  }
}

// Update Status (Won / Lost) of a specific offer (Triggers Meta CAPI!)
async function updateDealStatus(dealId, status) {
  // Invalidate local cache
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
    if (res.ok) {
      await fetchCrmContext(currentPhone, currentName, false);
    }
  } catch (err) {
    console.error("Failed to update deal status:", err);
  }
}

// Render Timeline Activities
function renderTimeline(acts) {
  if (!acts || acts.length === 0) {
    timelineList.innerHTML = `<div style="color: #64748b; font-size: 11px;">No activities recorded yet.</div>`;
    return;
  }

  timelineList.innerHTML = acts
    .map(
      (a) => `
    <div class="timeline-item">
      <div class="timeline-title">${a.title || a.type}</div>
      <div class="timeline-time">${new Date(a.scheduled_at || a.created_at).toLocaleDateString()} — ${(a.status || "COMPLETED").toUpperCase()}</div>
      ${a.description ? `<div style="color: #cbd5e1; margin-top: 2px;">${a.description}</div>` : ""}
    </div>
  `
    )
    .join("");
}

// Save Follow-up / Activity (Syncs to CRM + Google Calendar)
btnSaveFollowup.addEventListener("click", async () => {
  if (!currentContact || !authToken) return;

  btnSaveFollowup.textContent = "Saving to CRM...";
  btnSaveFollowup.disabled = true;

  try {
    const channel = fuChannel.value;
    const dealId = fuDealSelect.value || null;

    const body = {
      deal_id: dealId,
      contact_id: currentContact.id,
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
}, 200);
