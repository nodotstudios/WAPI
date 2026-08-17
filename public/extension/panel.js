/**
 * WAPI Extension Side-Panel Controller
 * Native Email & Password Session Auth + CRM Workspace
 */

let serverUrl = "https://wapi-blond.vercel.app";
let authToken = "";
let currentUser = null;

let currentPhone = "";
let currentName = "";
let currentContact = null;
let currentDeal = null;
let stagesList = [];

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

const dealTitle = document.getElementById("deal-title");
const dealStatus = document.getElementById("deal-status");
const stageSelect = document.getElementById("stage-select");
const dealValueInput = document.getElementById("deal-value");
const dealCurrencySelect = document.getElementById("deal-currency");

const btnSaveDeal = document.getElementById("btn-save-deal");
const btnMarkWon = document.getElementById("btn-mark-won");

const fuChannel = document.getElementById("fu-channel");
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
    chrome.storage.local.get(["wapiAuthToken", "wapiUser", "wapiServerUrl"], (items) => {
      if (items.wapiServerUrl) {
        serverUrl = items.wapiServerUrl.replace(/\/$/, "");
        loginUrlInput.value = serverUrl;
      }
      if (items.wapiAuthToken && items.wapiUser) {
        authToken = items.wapiAuthToken;
        currentUser = items.wapiUser;
        renderView(true);
        fetchCrmContext(currentPhone, currentName);
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

    // Save to storage
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
  currentDeal = null;

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.remove(["wapiAuthToken", "wapiUser"]);
  }

  renderView(false);
});

// Fetch CRM Context for Active Contact
async function fetchCrmContext(phone, name) {
  currentPhone = phone || "";
  currentName = name || "";

  if (!authToken) return;

  cName.textContent = currentName || "Loading CRM...";
  cPhone.textContent = currentPhone || "Fetching contact...";

  try {
    const params = new URLSearchParams();
    if (currentPhone) params.set("phone", currentPhone);
    if (currentName) params.set("name", currentName);

    const res = await fetch(`${serverUrl}/api/extension/context?${params.toString()}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Session expired
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
    currentDeal = data.deal;
    stagesList = data.stages || [];

    // Render Contact Info
    if (currentContact) {
      cName.textContent = currentContact.name || currentName || `Contact (${(currentContact.phone || "").slice(-4)})`;
      cPhone.textContent = currentContact.phone || currentPhone || "";
      cAvatar.textContent = (cName.textContent || "C").charAt(0).toUpperCase();
    } else {
      cName.textContent = currentName || "Select a Chat";
      cPhone.textContent = currentPhone || "Click any conversation in WhatsApp Web";
      cAvatar.textContent = "?";
    }

    // Render Stage Options
    stageSelect.innerHTML = stagesList
      .map(
        (s) => `<option value="${s.id}" ${currentDeal?.stage_id === s.id ? "selected" : ""}>${s.name}</option>`
      )
      .join("");

    // Render Deal Info
    if (currentDeal) {
      dealTitle.textContent = currentDeal.title || "Active Deal";
      dealStatus.textContent = (currentDeal.status || "OPEN").toUpperCase();
      dealValueInput.value = currentDeal.value || 0;
      dealCurrencySelect.value = currentDeal.currency || "USD";
    } else {
      dealTitle.textContent = currentContact ? "No Active Deal (Click to Create)" : "Pipeline Ready";
      dealStatus.textContent = "NEW";
      dealValueInput.value = 0;
    }

    // Render Timeline Activities
    renderTimeline(data.activities || []);
  } catch (err) {
    console.error("[WAPI Extension] Fetch context error:", err);
    cName.textContent = "Unable to load contact";
    cPhone.textContent = err.message || "Connection error";
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
      <div class="timeline-time">${new Date(a.scheduled_at || a.created_at).toLocaleDateString()} — ${a.status}</div>
      ${a.description ? `<div style="color: #cbd5e1; margin-top: 2px;">${a.description}</div>` : ""}
    </div>
  `
    )
    .join("");
}

// Update Deal
btnSaveDeal.addEventListener("click", async () => {
  if (!currentContact || !authToken) return;

  btnSaveDeal.textContent = "Saving...";
  try {
    const body = {
      deal_id: currentDeal?.id,
      contact_id: currentContact.id,
      stage_id: stageSelect.value,
      value: parseFloat(dealValueInput.value) || 0,
      currency: dealCurrencySelect.value,
      status: currentDeal?.status || "open",
    };

    const res = await fetch(`${serverUrl}/api/extension/deal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      btnSaveDeal.textContent = "Saved ✓";
      setTimeout(() => (btnSaveDeal.textContent = "Update Deal"), 2000);
      fetchCrmContext(currentPhone, currentName);
    } else {
      btnSaveDeal.textContent = "Failed ❌";
    }
  } catch (err) {
    btnSaveDeal.textContent = "Failed ❌";
  }
});

// Mark Deal Won (Triggers Meta CAPI Conversion Event!)
btnMarkWon.addEventListener("click", async () => {
  if (!currentContact || !authToken) return;

  btnMarkWon.textContent = "Processing...";
  try {
    const body = {
      deal_id: currentDeal?.id,
      contact_id: currentContact.id,
      stage_id: stageSelect.value,
      value: parseFloat(dealValueInput.value) || 0,
      currency: dealCurrencySelect.value,
      status: "won",
    };

    const res = await fetch(`${serverUrl}/api/extension/deal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      btnMarkWon.textContent = "🏆 Won & CAPI Fired!";
      setTimeout(() => (btnMarkWon.textContent = "🏆 Mark Won"), 2500);
      fetchCrmContext(currentPhone, currentName);
    } else {
      btnMarkWon.textContent = "Failed ❌";
    }
  } catch (err) {
    btnMarkWon.textContent = "Failed ❌";
  }
});

// Save Follow-up
btnSaveFollowup.addEventListener("click", async () => {
  if (!currentContact || !authToken) return;

  btnSaveFollowup.textContent = "Saving...";
  try {
    const channel = fuChannel.value;
    const typeStr = channel === "chat" ? "chat_followup" : channel === "call" ? "call_followup" : "meeting_followup";

    const body = {
      deal_id: currentDeal?.id,
      contact_id: currentContact.id,
      type: typeStr,
      title: fuTitle.value.trim() || `Follow-up via ${channel}`,
      scheduled_at: fuTime.value ? new Date(fuTime.value).toISOString() : new Date().toISOString(),
    };

    const res = await fetch(`${serverUrl}/api/extension/activity`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      btnSaveFollowup.textContent = "Scheduled ✓";
      fuTitle.value = "";
      setTimeout(() => (btnSaveFollowup.textContent = "Save Follow-up"), 2000);
      fetchCrmContext(currentPhone, currentName);
    } else {
      btnSaveFollowup.textContent = "Failed ❌";
    }
  } catch (err) {
    btnSaveFollowup.textContent = "Failed ❌";
  }
});

// Listen for contact change events from content script
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "WAPI_CONTACT_CHANGED") {
    fetchCrmContext(event.data.phone, event.data.name);
  }
});

// Initialize on load
initSession();
setTimeout(() => {
  window.parent.postMessage({ type: "WAPI_REQUEST_ACTIVE_PHONE" }, "*");
}, 300);
