# Bidi Chat Fixer

Chrome extension that fixes mixed **Arabic + English** text in AI chats so replies stay readable.

When a chat mixes RTL Arabic with LTR English, the browser’s bidirectional algorithm can scramble word order. This extension isolates each script run so the sentence reads in a natural order.

It does **not** reverse letters, and it does **not** change the conversation stored on the site. Display only.

Works on ChatGPT, Claude, DeepSeek, Grok, Gemini, Copilot, Perplexity, and similar chat sites.

---

## What you get

- Live fix while the AI is still typing
- **Enable fixer** on/off for the current tab by default
- Optional **All chat tabs** if you want one switch for every AI chat
- Code blocks, inputs, and editors are left unchanged

---

## Install (Load unpacked)

You do **not** need the Chrome Web Store. Install it from this folder.

### 1. Get the files

**Option A — download ZIP**

1. Open the repo: [https://github.com/Ali-Odeh/Bidi-Chat-Fixer](https://github.com/Ali-Odeh/Bidi-Chat-Fixer)
2. Click **Code** → **Download ZIP**
3. Unzip it anywhere, for example `Desktop\Bidi-Chat-Fixer`

**Option B — clone**

```bash
git clone https://github.com/Ali-Odeh/Bidi-Chat-Fixer.git
```

### 2. Load it in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the project folder (the one that contains `manifest.json`)
5. Pin the extension from the puzzle-piece menu if you want quick access

### 3. Use it

1. Open ChatGPT, Claude, DeepSeek, Grok, or another supported chat
2. Click the extension icon
3. Use the switches below
4. Refresh the chat tab once after the first install (later toggles apply without refresh)

If you update the files later, go back to `chrome://extensions` and click **Reload** on the extension card.

---

## Controls

The popup has two switches:

### Enable fixer

Turns the fixer **on or off**.

- **On:** mixed Arabic/English in the chat is rearranged so it is readable. New messages are fixed live.
- **Off:** the watcher stops and the page text goes back to the original layout.

By default this switch applies to **this tab only**. Claude can be on while ChatGPT is off.

### All chat tabs

Chooses the scope of **Enable fixer**.

- **Off (default):** each AI chat tab has its own on/off.
- **On:** **Enable fixer** becomes one global switch for every AI chat tab. Turning it off on one tab turns it off everywhere.

The status card at the top is not a button. It only shows whether the fixer is live or off on the current site.

---

## License

Personal / source-available. Use and modify freely.
