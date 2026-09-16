"use strict";

importScripts("hosts.js");

const SYNC_DEFAULTS = {
  enabled: true,
  scope: "tab"
};
const TAB_MAP_KEY = "tabEnabled";
const tabLocks = new Map();

async function getSyncSettings() {
  const stored = await chrome.storage.sync.get(SYNC_DEFAULTS);
  return {
    enabled: stored.enabled !== false,
    scope: stored.scope === "all" ? "all" : "tab"
  };
}

async function setSyncSettings(patch) {
  const current = await getSyncSettings();
  const next = { ...current, ...patch };
  await chrome.storage.sync.set(next);
  return next;
}

async function readTabMap() {
  const stored = await chrome.storage.session.get(TAB_MAP_KEY);
  return stored[TAB_MAP_KEY] || {};
}

async function writeTabMap(map) {
  await chrome.storage.session.set({ [TAB_MAP_KEY]: map });
}

async function getTabEnabled(tabId) {
  const map = await readTabMap();
  return map[String(tabId)] !== false;
}

async function setTabEnabled(tabId, enabled) {
  const map = await readTabMap();
  map[String(tabId)] = enabled;
  await writeTabMap(map);
}

async function setTabsEnabled(tabIds, enabled) {
  const map = await readTabMap();
  for (const tabId of tabIds) map[String(tabId)] = enabled;
  await writeTabMap(map);
}

async function forgetTab(tabId) {
  const map = await readTabMap();
  delete map[String(tabId)];
  await writeTabMap(map);
}

async function effectiveEnabled(tabId, sync = null) {
  const settings = sync || (await getSyncSettings());
  if (settings.scope === "all") return settings.enabled;
  return getTabEnabled(tabId);
}

async function setBadge(tabId, enabled, url) {
  await chrome.action.setBadgeText({
    tabId,
    text: bcfTabAllowed(url) && !enabled ? "OFF" : ""
  });
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: "#f43f5e"
  });
}

function lockTab(tabId, work) {
  const previous = tabLocks.get(tabId) || Promise.resolve();
  const next = previous.then(work, work);
  tabLocks.set(
    tabId,
    next.then(
      () => {},
      () => {}
    )
  );
  return next;
}

async function pingTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: BCF_MSG.PING });
  } catch {
    return null;
  }
}

async function injectTab(tabId) {
  const target = { tabId, allFrames: false };
  await chrome.scripting.insertCSS({ target, files: ["content.css"] });
  await chrome.scripting.executeScript({
    target,
    files: ["hosts.js", "content.js"]
  });
}

async function ensureInjected(tabId) {
  if ((await pingTab(tabId))?.ok) return true;
  await new Promise((resolve) => setTimeout(resolve, 60));
  if ((await pingTab(tabId))?.ok) return true;
  try {
    await injectTab(tabId);
    return Boolean((await pingTab(tabId))?.ok);
  } catch {
    return false;
  }
}

async function sendApply(tabId, enabled) {
  await chrome.tabs.sendMessage(tabId, { type: BCF_MSG.APPLY, enabled });
}

async function sendTeardown(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: BCF_MSG.TEARDOWN });
  } catch {
    // The tab never received the content script.
  }
}

async function applyToTab(tabId, enabled, url) {
  await setBadge(tabId, enabled, url);

  if (!(enabled && bcfTabAllowed(url))) {
    await sendTeardown(tabId);
    return { ok: true, enabled, active: false };
  }

  if (!(await ensureInjected(tabId))) {
    return { ok: false, enabled, active: false };
  }

  try {
    await sendApply(tabId, true);
    return { ok: true, enabled, active: true };
  } catch {
    return { ok: false, enabled, active: false };
  }
}

async function applyLocked(tabId, enabled, url) {
  return lockTab(tabId, () => applyToTab(tabId, enabled, url));
}

async function chatTabs() {
  return chrome.tabs.query({ url: bcfContentMatches() });
}

async function snapshot(tab) {
  const settings = await getSyncSettings();
  const enabled = await effectiveEnabled(tab.id, settings);
  return {
    ok: true,
    enabled,
    active: enabled && bcfTabAllowed(tab.url || ""),
    scope: settings.scope
  };
}

async function applyCurrentTab(tab, enabled) {
  const settings = await getSyncSettings();
  if (settings.scope === "all") {
    await setSyncSettings({ enabled });
    const tabs = await chatTabs();
    await setTabsEnabled(
      tabs.map((item) => item.id).filter(Boolean),
      enabled
    );
    const results = await Promise.all(
      tabs.map((item) =>
        item.id ? applyLocked(item.id, enabled, item.url || "") : null
      )
    );
    const current = results.find((item, index) => tabs[index]?.id === tab.id);
    return { ...(current || { ok: true, enabled, active: false }), scope: "all" };
  }

  await setTabEnabled(tab.id, enabled);
  const result = await applyLocked(tab.id, enabled, tab.url || "");
  return { ...result, scope: "tab" };
}

async function setScope(tab, scope) {
  const settings = await setSyncSettings({ scope });
  if (scope !== "all") {
    return snapshot(tab);
  }

  const enabled = await effectiveEnabled(tab.id, { ...settings, scope: "tab" });
  await setSyncSettings({ scope: "all", enabled });
  const tabs = await chatTabs();
  await setTabsEnabled(
    tabs.map((item) => item.id).filter(Boolean),
    enabled
  );
  await Promise.all(
    tabs.map((item) =>
      item.id ? applyLocked(item.id, enabled, item.url || "") : null
    )
  );
  return snapshot(tab);
}

async function registerChatScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [BCF_SCRIPT_ID] });
  } catch {
    // Not registered yet.
  }

  await chrome.scripting.registerContentScripts([
    {
      id: BCF_SCRIPT_ID,
      matches: bcfContentMatches(),
      js: ["hosts.js", "content.js"],
      css: ["content.css"],
      allFrames: false,
      runAt: "document_idle",
      persistAcrossSessions: true
    }
  ]);
}

async function boot() {
  await registerChatScripts();
  const tabs = await chatTabs();
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      const enabled = await effectiveEnabled(tab.id);
      await applyLocked(tab.id, enabled, tab.url || "");
    })
  );
}

chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
chrome.tabs.onRemoved.addListener((tabId) => {
  forgetTab(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message?.tabId ?? sender.tab?.id;

  if (message?.type === BCF_MSG.GET_TAB) {
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, enabled: true, active: false, scope: "tab" });
      return false;
    }
    chrome.tabs
      .get(tabId)
      .then((tab) => snapshot(tab))
      .then(sendResponse)
      .catch(() =>
        sendResponse({ ok: false, enabled: true, active: false, scope: "tab" })
      );
    return true;
  }

  if (message?.type === BCF_MSG.APPLY_TAB && typeof tabId === "number") {
    chrome.tabs
      .get(tabId)
      .then(async (tab) => {
        if (message.settings?.scope) {
          return setScope(tab, message.settings.scope);
        }
        return applyCurrentTab(tab, message.settings?.enabled !== false);
      })
      .then(sendResponse)
      .catch(() =>
        sendResponse({ ok: false, enabled: false, active: false, scope: "tab" })
      );
    return true;
  }

  return false;
});
