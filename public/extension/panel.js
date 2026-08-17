/**
 * WAPI Extension Side-Panel Controller
 */

let currentPhone = null;
let currentContact = null;
let currentDeal = null;
let stagesList = [];
let serverUrl = "https://wapi-blond.vercel.app";
let apiKey = "";

// DOM Elements
const cfgModal = document.getElementById("config-modal");
const cfgUrlInput = document.getElementById("cfg-url");
const cfgApiKeyInput = document.getElementById("cfg-apikey");
const openSettingsBtn = document.getElementById("open-settings-btn");
const closeSettingsBtn = document.getElementById("close-config-btn");
const saveConfigBtn = document.getElementById("save-config-btn");

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

// Load stored settings
function loadSettings() {
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["wapiServerUrl", "wapiApiKey"], (items) => {
      if (items.wapiServerUrl) serverUrl = items.wapiServerUrl.replace(/\/$/, "");
      if (items.wapiApiKey) apiKey = items.wapiApiKey;
      cfgUrlInput.value = serverUrl;
      cfgApiKeyInput.value = apiKey;

      if (!apiKey) {
        cfgModal.style.display = "block";
      }
    });
  }
}

// Save config
saveConfigBtn.addEventListener("click", () => {
  serverUrl = cfgUrlInput.value.trim().replace(/\/$/, "") || "https://wapi-blond.vercel.app";
  apiKey = cfgApiKeyInput.value.trim();

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      wapiServerUrl: serverUrl,
      wapiApiKey: apiKey,
    });
  }

  cfgModal.style.display = "none";
  if (currentPhone) fetchCrmContext(currentPhone);
});

openSettingsBtn.addEventListener("click", () => {
  cfgModal.style.display = "block";
});

closeSettingsBtn.addEventListener("click", () => {
  cfgModal.style.display = "none";
});

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    const cleanKey = apiKey.trim();
    headers["Authorization"] = `Bearer ${cleanKey}`;
    headers["X-API-Key"] = cleanKey;
  }
  return headers;
}

// Fetch CRM context for active contact
async function fetchCrmContext(phone) {
  if (!phone) return;
  currentPhone = phone;

  cName.textContent = "Loading CRM...";
  cPhone.textContent = phone;

  try {
    const res = await fetch(`${serverUrl}/api/extension/context?phone=${encodeURIComponent(phone)}`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      if (res.status === 401) {
        cName.textContent = "API Key Required";
        cPhone.textContent = "Click ⚙️ to enter WAPI API key";
        cfgModal.style.display = "block";
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    currentContact = data.contact;
    currentDeal = data.deal;
    stagesList = data.stages || [];

    // Render Contact Info
    cName.textContent = currentContact?.name || `Contact (${phone.slice(-4)})`;
    cPhone.textContent = currentContact?.phone || phone;
    cAvatar.textContent = (currentContact?.name || phone).charAt(0).toUpperCase();

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
      dealTitle.textContent = "No Active Deal (Click to Create)";
      dealStatus.textContent = "NEW";
      dealValueInput.value = 0;
    }

    // Render Timeline Activities
    renderTimeline(data.activities || []);
  } catch (err) {
    console.error("[WAPI Extension] Fetch context error:", err);
    cName.textContent = "Connection Error";
    cPhone.textContent = "Check WAPI URL & API key in settings";
  }
}

// Render Timeline
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
  if (!currentContact) return;

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
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      btnSaveDeal.textContent = "Saved ✓";
      setTimeout(() => (btnSaveDeal.textContent = "Update Deal"), 2000);
      if (currentPhone) fetchCrmContext(currentPhone);
    } else {
      btnSaveDeal.textContent = "Failed ❌";
    }
  } catch (err) {
    btnSaveDeal.textContent = "Failed ❌";
  }
});

// Mark Deal Won (Triggers Meta CAPI Conversion Event!)
btnMarkWon.addEventListener("click", async () => {
  if (!currentContact) return;

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
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      btnMarkWon.textContent = "🏆 Won & CAPI Fired!";
      setTimeout(() => (btnMarkWon.textContent = "🏆 Mark Won"), 2500);
      if (currentPhone) fetchCrmContext(currentPhone);
    } else {
      btnMarkWon.textContent = "Failed ❌";
    }
  } catch (err) {
    btnMarkWon.textContent = "Failed ❌";
  }
});

// Save Follow-up
btnSaveFollowup.addEventListener("click", async () => {
  if (!currentContact) return;

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
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      btnSaveFollowup.textContent = "Scheduled ✓";
      fuTitle.value = "";
      setTimeout(() => (btnSaveFollowup.textContent = "Save Follow-up"), 2000);
      if (currentPhone) fetchCrmContext(currentPhone);
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
    if (event.data.phone) {
      fetchCrmContext(event.data.phone);
    }
  }
});

// Init
loadSettings();
window.parent.postMessage({ type: "WAPI_REQUEST_ACTIVE_PHONE" }, "*");
