(function initBcfHosts(root) {
  if (root.__bcfHostsLoaded) return;
  root.__bcfHostsLoaded = true;

  root.BCF_VERSION = "1.5.0";
  root.BCF_SCRIPT_ID = "bcf-main";

  root.BCF_MSG = {
    PING: "bcf-ping",
    APPLY: "bcf-apply",
    APPLY_TAB: "bcf-apply-tab",
    GET_TAB: "bcf-get-tab",
    TEARDOWN: "bcf-teardown"
  };

  root.BCF_CHAT_HOSTS = [
    "chatgpt.com",
    "chat.openai.com",
    "claude.ai",
    "chat.deepseek.com",
    "deepseek.com",
    "grok.com",
    "gemini.google.com",
    "copilot.microsoft.com",
    "perplexity.ai",
    "poe.com",
    "chat.mistral.ai",
    "huggingface.co",
    "you.com",
    "meta.ai",
    "kimi.com",
    "kimi.moonshot.cn",
    "qwen.ai",
    "tongyi.aliyun.com",
    "character.ai",
    "phind.com",
    "openrouter.ai",
    "chat.lmsys.org",
    "copilot.cloud.microsoft"
  ];

  root.bcfNormalizeHost = function bcfNormalizeHost(hostname) {
    return String(hostname || "")
      .replace(/^www\./, "")
      .toLowerCase();
  };

  root.bcfIsChatHost = function bcfIsChatHost(hostname) {
    const host = root.bcfNormalizeHost(hostname);
    return root.BCF_CHAT_HOSTS.some(
      (item) => host === item || host.endsWith(`.${item}`)
    );
  };

  root.bcfTabAllowed = function bcfTabAllowed(url) {
    if (!url || !/^https?:/i.test(url)) return false;
    try {
      return root.bcfIsChatHost(new URL(url).hostname);
    } catch {
      return false;
    }
  };

  root.bcfContentMatches = function bcfContentMatches() {
    return root.BCF_CHAT_HOSTS.flatMap((host) => [
      `https://${host}/*`,
      `https://*.${host}/*`
    ]);
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
