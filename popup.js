"use strict";

const enabledEl = document.getElementById("enabled");
const allTabsEl = document.getElementById("allTabs");
const statusCard = document.getElementById("statusCard");
const statusLabel = document.getElementById("statusLabel");
const statusHost = document.getElementById("statusHost");

let busy = false;

function setBusy(next) {
  busy = next;
  enabledEl.disabled = next;
  allTabsEl.disabled = next;
}

function setStatus(kind, label, host) {
  statusCard.classList.remove("live", "off");
  if (kind) statusCard.classList.add(kind);
  statusLabel.textContent = label;
  statusHost.textContent = host || "—";
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderStatus(tab, result) {
  const host = hostFromUrl(tab?.url || "");
  const scope = result?.scope === "all" ? "all chat tabs" : "this tab";

  if (!tab?.id || !host) {
    setStatus("off", "Unavailable on this page", tab?.url || "Chrome internal page");
    return;
  }
  if (!result?.enabled) {
    setStatus("off", `Off for ${scope}`, host);
    return;
  }
  if (result.active) {
    setStatus("live", `Live on ${scope}`, host);
    return;
  }
  if (bcfIsChatHost(host)) {
    setStatus("", "Could not attach to this tab", host);
    return;
  }
  setStatus("", "This site is not an AI chat, so the fixer stays idle.", host);
}

function applyResult(tab, result) {
  enabledEl.checked = result?.enabled !== false;
  allTabsEl.checked = result?.scope === "all";
  renderStatus(tab, result);
}

async function send(settings) {
  const tab = await currentTab();
  if (!tab?.id) return;
  return chrome.runtime.sendMessage({
    type: BCF_MSG.APPLY_TAB,
    tabId: tab.id,
    settings
  }).then((result) => {
    applyResult(tab, result);
    return result;
  });
}

async function load() {
  const tab = await currentTab();
  if (!tab?.id) {
    applyResult(tab, { enabled: false, active: false, scope: "tab" });
    return;
  }
  const result = await chrome.runtime.sendMessage({
    type: BCF_MSG.GET_TAB,
    tabId: tab.id
  });
  applyResult(tab, result);
}

async function onToggle(settings) {
  if (busy) return;
  setBusy(true);
  try {
    await send(settings);
  } finally {
    setBusy(false);
  }
}

enabledEl.addEventListener("change", () => {
  onToggle({ enabled: enabledEl.checked });
});

allTabsEl.addEventListener("change", () => {
  onToggle({ scope: allTabsEl.checked ? "all" : "tab" });
});

load();
