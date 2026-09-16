(() => {
  "use strict";

  if (typeof window.__bcfCleanup === "function") {
    window.__bcfCleanup();
  }

  const ARABIC =
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const LATIN = /[A-Za-z]/;
  const LTR_STRONG = /[A-Za-z0-9]/;
  const DEBOUNCE_MS = 120;
  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "PRE",
    "CODE",
    "KBD",
    "SAMP",
    "SVG",
    "CANVAS",
    "MATH"
  ]);

  let enabled = false;
  let observer = null;
  let timer = 0;
  let mutating = false;
  let applying = false;
  const pending = new Set();

  function shouldRun() {
    return enabled && bcfIsChatHost(location.hostname);
  }

  function classifyChar(ch) {
    if (ARABIC.test(ch)) return "rtl";
    if (LTR_STRONG.test(ch)) return "ltr";
    return "neutral";
  }

  function splitRuns(text) {
    const runs = [];
    let type = null;
    let buffer = "";

    const flush = () => {
      if (!buffer) return;
      runs.push({ type: type || "neutral", text: buffer });
      type = null;
      buffer = "";
    };

    for (const ch of text) {
      const next = classifyChar(ch);
      if (next === "neutral") {
        buffer += ch;
        continue;
      }
      if (type === null || type === next) {
        type = next;
        buffer += ch;
        continue;
      }
      flush();
      type = next;
      buffer = ch;
    }

    flush();
    return runs;
  }

  function isProtected(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (SKIP_TAGS.has(el.tagName) || el.isContentEditable) return true;
    return Boolean(
      el.closest("pre, code, textarea, input, [contenteditable='true']")
    );
  }

  function isTextish(node) {
    return Boolean(
      node &&
        (node.nodeType === Node.TEXT_NODE ||
          (node.nodeType === Node.ELEMENT_NODE && node.dataset.bcfIso === "1"))
    );
  }

  function closestBlock(el) {
    const preferred = el.closest(
      "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th"
    );
    if (preferred) return preferred;

    const block = el.closest("div");
    if (!block) return el;
    if (block.querySelectorAll("p, li, pre, table, article").length > 6) {
      return el;
    }
    return block;
  }

  function applyParentDir(parent, runs) {
    const block = closestBlock(parent);
    if (!block) return;

    let rtl = 0;
    let ltr = 0;
    for (const run of runs) {
      const count = run.text.replace(/\s+/g, "").length;
      if (run.type === "rtl") rtl += count;
      if (run.type === "ltr") ltr += count;
    }
    if (!rtl || !ltr) return;

    block.dataset.bcfDir = rtl >= ltr ? "rtl" : "ltr";
    block.setAttribute("dir", block.dataset.bcfDir);
  }

  function collectRun(node) {
    let start = node;
    while (start.previousSibling && isTextish(start.previousSibling)) {
      start = start.previousSibling;
    }

    const nodes = [];
    let text = "";
    let current = start;
    while (current && isTextish(current)) {
      nodes.push(current);
      text += current.textContent || "";
      current = current.nextSibling;
    }
    return { nodes, text };
  }

  function createWrappedFragment(runs) {
    const frag = document.createDocumentFragment();
    for (const run of runs) {
      if (run.type === "neutral") {
        frag.appendChild(document.createTextNode(run.text));
        continue;
      }
      const span = document.createElement("span");
      span.dataset.bcfIso = "1";
      span.className = "bcf-iso";
      span.setAttribute("dir", run.type === "rtl" ? "rtl" : "ltr");
      span.textContent = run.text;
      frag.appendChild(span);
    }
    return frag;
  }

  function needsWrap(nodes, text) {
    if (!nodes.length || !text.trim()) return null;
    if (!ARABIC.test(text) || !LATIN.test(text)) return null;

    const runs = splitRuns(text);
    const mixed = runs.filter((run) => run.type === "rtl" || run.type === "ltr");
    if (mixed.length < 2) return null;

    const alreadyWrapped = nodes.every(
      (item) => item.nodeType === Node.ELEMENT_NODE && item.dataset.bcfIso === "1"
    );
    const hasMixedTextNode = nodes.some(
      (item) =>
        item.nodeType === Node.TEXT_NODE &&
        ARABIC.test(item.nodeValue || "") &&
        LATIN.test(item.nodeValue || "")
    );
    if (alreadyWrapped && !hasMixedTextNode) return null;
    return runs;
  }

  function wrapRunFromNode(node) {
    if (!isTextish(node) || !node.parentNode) return;

    const parent = node.parentElement;
    if (!parent || isProtected(parent) || parent.dataset.bcfIso === "1") return;

    const { nodes, text } = collectRun(node);
    const runs = needsWrap(nodes, text);
    if (!runs) return;

    mutating = true;
    try {
      applyParentDir(parent, runs);
      parent.insertBefore(
        createWrappedFragment(runs),
        nodes[nodes.length - 1].nextSibling
      );
      for (const item of nodes) item.remove();
    } finally {
      mutating = false;
    }
  }

  function walk(root) {
    if (!shouldRun() || !root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      wrapRunFromNode(root);
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE && isProtected(root)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || isProtected(parent)) return NodeFilter.FILTER_REJECT;
        const value = node.nodeValue || "";
        if (!ARABIC.test(value) && !LATIN.test(value)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const seen = new Set();
    const starts = [];
    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      const first = collectRun(current).nodes[0];
      if (first && !seen.has(first)) {
        seen.add(first);
        starts.push(first);
      }
    }
    for (const start of starts) wrapRunFromNode(start);
  }

  function queue(node) {
    if (mutating || !shouldRun() || !node) return;
    pending.add(node);
    if (timer) return;
    timer = setTimeout(flushQueue, DEBOUNCE_MS);
  }

  function flushQueue() {
    timer = 0;
    if (!shouldRun()) {
      pending.clear();
      return;
    }

    const nodes = [...pending];
    pending.clear();
    for (const node of nodes) {
      if (!node.isConnected && node !== document.body) continue;
      if (node === document.body) {
        walk(document.body);
        return;
      }
      walk(node);
    }
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver((mutations) => {
      if (mutating || !shouldRun()) return;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          queue(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && node.dataset.bcfIso) {
            continue;
          }
          queue(node);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    pending.clear();
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
  }

  function unwrapPage() {
    mutating = true;
    try {
      const parents = new Set();
      document.querySelectorAll("[data-bcf-iso='1']").forEach((span) => {
        if (span.parentNode) parents.add(span.parentNode);
        span.replaceWith(document.createTextNode(span.textContent || ""));
      });
      document.querySelectorAll("[data-bcf-dir]").forEach((el) => {
        el.removeAttribute("dir");
        el.removeAttribute("data-bcf-dir");
      });
      for (const parent of parents) parent.normalize();
    } finally {
      mutating = false;
    }
  }

  function teardown() {
    stopObserver();
    unwrapPage();
  }

  function applyNow() {
    const want = shouldRun();
    if (want && observer) return { active: true };
    if (!want && !observer) {
      unwrapPage();
      return { active: false };
    }
    if (!want) {
      teardown();
      return { active: false };
    }
    if (applying) return { active: true };
    applying = true;
    try {
      stopObserver();
      unwrapPage();
      walk(document.body);
      startObserver();
      return { active: true };
    } finally {
      applying = false;
    }
  }

  function setEnabled(next) {
    if (typeof next === "boolean") enabled = next;
    return applyNow();
  }

  function onMessage(message, _sender, sendResponse) {
    switch (message?.type) {
      case BCF_MSG.PING:
        sendResponse({ ok: true, version: BCF_VERSION });
        return;
      case BCF_MSG.APPLY:
        sendResponse(setEnabled(message.enabled));
        return;
      case BCF_MSG.TEARDOWN:
        enabled = false;
        teardown();
        sendResponse({ ok: true, active: false });
        return;
      default:
        return;
    }
  }

  window.__bcfCleanup = () => {
    stopObserver();
    chrome.runtime.onMessage.removeListener(onMessage);
  };

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.runtime.sendMessage({ type: BCF_MSG.GET_TAB }, (state) => {
    if (chrome.runtime.lastError) return;
    setEnabled(state?.enabled !== false);
  });
})();
