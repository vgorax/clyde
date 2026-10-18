import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm";

// ---------------------------------------------------------------------------
// Workbook tabs
// ---------------------------------------------------------------------------
const TABS = [
  { id: "html", label: "HTML", ext: "html" },
  { id: "css", label: "CSS", ext: "css" },
  { id: "javascript", label: "JavaScript", ext: "js" },
  { id: "markdown", label: "Markdown", ext: "md" },
  { id: "react", label: "React", ext: "jsx" },
];
const TAB_IDS = TABS.map((t) => t.id);

const STARTERS = {
  html: `<h1>Hello from the workbook</h1>\n<p>Ask Claude (left) to build something — code lands here.</p>\n<button id="btn">Click me</button>\n`,
  css: `body { font-family: system-ui, sans-serif; padding: 24px; }\nh1 { color: #d97757; }\n`,
  javascript: `document.getElementById("btn")?.addEventListener("click", () => alert("hi!"));\n`,
  markdown: `# Notes\n\n- Markdown renders in the preview\n- Ask Claude to write docs here\n`,
  react: `function App() {\n  const [n, setN] = React.useState(0);\n  return (\n    <div style={{ fontFamily: "system-ui", padding: 24 }}>\n      <h1>React counter: {n}</h1>\n      <button onClick={() => setN(n + 1)}>+1</button>\n    </div>\n  );\n}\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);\n`,
};

// Session-only: everything (key, code, settings) lives in this tab's memory and
// is gone when the tab closes or reloads. Nothing is written to browser storage.
const memory = new Map();
const store = {
  get(k, fallback = null) { return memory.has(k) ? memory.get(k) : fallback; },
  set(k, v) { memory.set(k, v); },
  del(k) { memory.delete(k); },
};
// Wipe anything an older version of clyde left in localStorage.
try {
  for (const k of Object.keys(localStorage)) if (k.startsWith("clyde.")) localStorage.removeItem(k);
} catch {}

let files = (() => {
  try { return { ...STARTERS, ...JSON.parse(store.get("clyde.files", "{}")) }; } catch { return { ...STARTERS }; }
})();
let activeTab = store.get("clyde.tab", "html");
let lastPreviewTab = "html";

const $ = (id) => document.getElementById(id);
const editor = $("editor");
const gutter = $("gutter");
const preview = $("preview");

function saveFiles() { store.set("clyde.files", JSON.stringify(files)); }

function renderTabs() {
  $("tabs").innerHTML = "";
  for (const t of TABS) {
    const b = document.createElement("button");
    b.className = "tab" + (t.id === activeTab ? " active" : "");
    b.textContent = t.label;
    b.onclick = () => selectTab(t.id);
    $("tabs").appendChild(b);
  }
}

function selectTab(id) {
  activeTab = id;
  store.set("clyde.tab", id);
  editor.value = files[id] ?? "";
  renderTabs();
  updateGutter();
  if ($("auto-run").checked) runPreview();
}

function updateGutter() {
  const n = editor.value.split("\n").length;
  gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n");
  gutter.scrollTop = editor.scrollTop;
}

let editTimer;
editor.addEventListener("input", () => {
  files[activeTab] = editor.value;
  saveFiles();
  updateGutter();
  clearTimeout(editTimer);
  if ($("auto-run").checked) editTimer = setTimeout(runPreview, 500);
});
editor.addEventListener("scroll", () => { gutter.scrollTop = editor.scrollTop; });
editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
    editor.dispatchEvent(new Event("input"));
  }
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runPreview(); }
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------
const escapeScript = (s) => s.replace(/<\/script/gi, "<\\/script");

function buildPreview(tab) {
  const css = `<style>${files.css}</style>`;
  switch (tab) {
    case "markdown":
      return `<!doctype html><meta charset="utf-8">
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6}pre{background:#f4f4f4;padding:10px;overflow:auto}code{background:#f4f4f4;padding:0 3px}</style>
<div id="md"></div>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>document.getElementById("md").innerHTML = marked.parse(${JSON.stringify(files.markdown)});</script>`;
    case "react":
      return `<!doctype html><meta charset="utf-8">${css}
<div id="root"></div>
<script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.development.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js"></script>
<script>window.onerror=(m)=>{document.body.insertAdjacentHTML("beforeend","<pre style='color:#c00'>"+m+"</pre>")}</script>
<script type="text/babel" data-presets="react">${escapeScript(files.react)}</script>`;
    default: // html / css / javascript all render together as one page
      return `<!doctype html><meta charset="utf-8">${css}
<script>window.onerror=(m)=>{document.body.insertAdjacentHTML("beforeend","<pre style='color:#c00'>"+m+"</pre>")}</script>
${files.html}
<script>${escapeScript(files.javascript)}</script>`;
  }
}

function runPreview() {
  const tab = ["html", "css", "javascript"].includes(activeTab) ? "html" : activeTab;
  lastPreviewTab = tab;
  $("preview-label").textContent = tab === "html" ? "preview · html + css + js" : `preview · ${tab}`;
  preview.srcdoc = buildPreview(tab);
}

$("run").onclick = runPreview;
$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(files[activeTab]); sys("Copied " + activeTab + " to clipboard."); } catch { sys("Clipboard not available."); }
};
$("download").onclick = () => {
  const t = TABS.find((x) => x.id === activeTab);
  const name = t.id === "react" ? "App.jsx" : `index.${t.ext}`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([files[activeTab]], { type: "text/plain" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

// Resizable divider
(() => {
  const div = $("divider");
  const term = document.querySelector(".terminal");
  let dragging = false;
  div.addEventListener("mousedown", () => { dragging = true; preview.style.pointerEvents = "none"; });
  addEventListener("mouseup", () => { dragging = false; preview.style.pointerEvents = ""; });
  addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const pct = Math.min(75, Math.max(20, (e.clientX / innerWidth) * 100));
    term.style.flex = `0 0 ${pct}%`;
  });
})();

// ---------------------------------------------------------------------------
// API key + model
// ---------------------------------------------------------------------------
const keyInput = $("api-key");
const modelSel = $("model");

modelSel.value = store.get("clyde.model", "claude-opus-5-5");

function refreshKeyStatus() {
  const ok = keyInput.value.trim().length > 0;
  $("key-status").textContent = ok ? "key set" : "no key";
  $("key-status").className = "key-status " + (ok ? "on" : "off");
}
keyInput.addEventListener("input", refreshKeyStatus);
modelSel.addEventListener("change", () => store.set("clyde.model", modelSel.value));
$("key-form").addEventListener("submit", (e) => e.preventDefault());

function client() {
  return new Anthropic({ apiKey: keyInput.value.trim(), dangerouslyAllowBrowser: true });
}

// ---------------------------------------------------------------------------
// Terminal log
// ---------------------------------------------------------------------------
const log = $("log");
function line(cls, text = "") {
  const el = document.createElement("div");
  el.className = "line " + cls;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}
const sys = (t) => line("system", t);

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------
const SYSTEM = `You are Claude, pair-programming with the user inside "Clyde", a split-screen app: a terminal chat on the left and a multi-tab code workbook on the right.

Workbook tabs (ids): html, css, javascript, markdown, react.
- html + css + javascript render together as one page (html is the <body> content; no <html>/<head> needed; css is injected as a <style>; javascript runs after the body).
- react is a single JSX file run with React 18 UMD globals (React, ReactDOM) and Babel standalone. No imports; end with ReactDOM.createRoot(document.getElementById("root")).render(<App />).
- markdown renders as a document.

To put code in the workbook, call the write_code tool — always write the COMPLETE file contents for a tab (it replaces the tab). Use several calls to fill several tabs. Don't paste the same code into chat as well; in chat, keep replies short and terminal-friendly (plain text, minimal markdown) and say what you wrote. Each user message includes the workbook's current contents so you can see the user's edits.`;

const TOOLS = [
  {
    name: "write_code",
    description: "Write the complete contents of one workbook tab, replacing what was there. The workbook preview updates automatically.",
    input_schema: {
      type: "object",
      properties: {
        tab: { type: "string", enum: TAB_IDS, description: "Which workbook tab to write." },
        code: { type: "string", description: "The full file contents for that tab." },
      },
      required: ["tab", "code"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
];

let history = []; // Anthropic MessageParam[] — append-only
let busy = false;
let abortCtl = null;

function workbookSnapshot() {
  return "<workbook>\n" + TAB_IDS.map((id) => `<tab id="${id}">\n${files[id]}\n</tab>`).join("\n") + "\n</workbook>";
}

function applyCode(tab, code) {
  files[tab] = code;
  saveFiles();
  if (activeTab !== tab) selectTab(tab);
  else { editor.value = code; updateGutter(); }
}

function validInput(input) {
  return input && typeof input === "object" && TAB_IDS.includes(input.tab) && typeof input.code === "string";
}

// Drop the unfinished exchange so history ends on a complete assistant turn,
// and discard any half-streamed code from the editor.
function rollback() {
  const done = (m) => m.role === "assistant" && !m.content.some((b) => b.type === "tool_use");
  while (history.length && !done(history.at(-1))) history.pop();
  editor.value = files[activeTab];
  updateGutter();
}

async function send(text) {
  if (!keyInput.value.trim()) { line("error", "Add your Claude API key in the top bar first (console.anthropic.com → API keys)."); return; }
  busy = true;
  $("send").textContent = "stop";

  history.push({
    role: "user",
    content: [
      { type: "text", text: workbookSnapshot() },
      { type: "text", text },
    ],
  });

  const model = modelSel.value;
  const anthropic = client();

  try {
    // Manual agent loop: stream a turn, run write_code calls, repeat until Claude stops.
    for (let turn = 0; turn < 12; turn++) {
      const params = {
        model,
        max_tokens: 64000,
        system: SYSTEM,
        tools: TOOLS,
        messages: history,
      };
      if (model !== "claude-haiku-4-5") {
        params.output_config = { effort: "high" };
        params.betas = ["server-side-fallback-2026-07-01"];
        params.fallbacks = "default";
      }

      abortCtl = new AbortController();
      const spinner = line("spinner", "✻ thinking…");
      let textEl = null;
      let streamingTab = null;

      const stream = model === "claude-haiku-4-5"
        ? anthropic.messages.stream(params, { signal: abortCtl.signal })
        : anthropic.beta.messages.stream(params, { signal: abortCtl.signal });

      stream.on("streamEvent", (event) => {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "text") {
            spinner.remove();
            textEl = line("assistant");
          } else if (event.content_block.type === "tool_use") {
            spinner.remove();
            streamingTab = null;
            textEl = line("tool", `write_code …`);
          }
        }
      });
      stream.on("text", (delta) => {
        if (textEl) { textEl.textContent += delta; log.scrollTop = log.scrollHeight; }
      });
      // Live-stream code into the editor as the tool input arrives.
      stream.on("inputJson", (_delta, snapshot) => {
        if (!snapshot || !TAB_IDS.includes(snapshot.tab)) return;
        if (streamingTab !== snapshot.tab) {
          streamingTab = snapshot.tab;
          if (activeTab !== streamingTab) selectTab(streamingTab);
        }
        if (typeof snapshot.code === "string") {
          editor.value = snapshot.code;
          updateGutter();
          editor.scrollTop = editor.scrollHeight;
          if (textEl) textEl.textContent = `write_code(${snapshot.tab}) · ${snapshot.code.split("\n").length} lines`;
        }
      });

      const message = await stream.finalMessage();
      spinner.remove();

      // Keep Claude's turn exactly as returned (thinking blocks included).
      history.push({ role: "assistant", content: message.content });

      const toolUses = message.content.filter((b) => b.type === "tool_use");

      if (message.stop_reason === "refusal") {
        line("error", "Claude declined this request.");
        // Undo the partial live-streamed editor text.
        rollback();
        break;
      }
      if (message.stop_reason === "max_tokens" && toolUses.length) {
        line("error", "Response hit the token limit mid-file; code was not applied. Try asking for a smaller piece.");
        rollback();
        break;
      }
      if (message.stop_reason === "pause_turn") continue;
      if (message.stop_reason !== "tool_use" || !toolUses.length) break;

      const results = [];
      for (const tu of toolUses) {
        if (validInput(tu.input)) {
          applyCode(tu.input.tab, tu.input.code);
          const lines = tu.input.code.split("\n").length;
          results.push({ type: "tool_result", tool_use_id: tu.id, content: `Wrote ${lines} lines to the ${tu.input.tab} tab.` });
        } else {
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: `Invalid input: need {tab: one of ${TAB_IDS.join(", ")}, code: string}.` });
          line("error", "write_code got invalid input; asking Claude to retry.");
        }
      }
      if ($("auto-run").checked) runPreview();
      history.push({ role: "user", content: results });
    }
  } catch (err) {
    document.querySelectorAll(".log .spinner").forEach((el) => el.remove());
    if (err instanceof Anthropic.APIUserAbortError) {
      line("system", "(stopped)");
    } else if (err instanceof Anthropic.AuthenticationError) {
      line("error", "Invalid API key (401). Check the key in the top bar.");
    } else if (err instanceof Anthropic.RateLimitError) {
      line("error", "Rate limited (429). Wait a moment and try again.");
    } else if (err instanceof Anthropic.APIError) {
      line("error", `API error ${err.status ?? ""}: ${err.message}`);
    } else {
      line("error", String(err?.message || err));
    }
    rollback();
  } finally {
    busy = false;
    abortCtl = null;
    $("send").textContent = "send";
  }
}

// ---------------------------------------------------------------------------
// Input + commands
// ---------------------------------------------------------------------------
const input = $("chat-input");

function autosize() { input.style.height = "auto"; input.style.height = input.scrollHeight + "px"; }
input.addEventListener("input", autosize);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chat-form").requestSubmit(); }
});

function clearChat() { history = []; log.innerHTML = ""; banner(); }

$("clear-chat").onclick = clearChat;

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (busy) { abortCtl?.abort(); return; }
  const text = input.value.trim();
  if (!text) return;
  input.value = ""; autosize();

  if (text.startsWith("/")) {
    const [cmd, ...rest] = text.slice(1).split(/\s+/);
    line("user", text);
    switch (cmd) {
      case "help":
        sys("/clear          reset the conversation\n/model <id>     switch model (opus, sonnet, haiku)\n/tab <id>       open a tab: " + TAB_IDS.join(", ") + "\n/reset-code     restore starter code in all tabs\n/run            render the preview");
        break;
      case "clear": clearChat(); break;
      case "model": {
        const m = { opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-4-5" }[rest[0]] || rest[0];
        if ([...modelSel.options].some((o) => o.value === m)) { modelSel.value = m; store.set("clyde.model", m); sys("model → " + m); }
        else sys("Unknown model. Try: opus, sonnet, haiku");
        break;
      }
      case "tab":
        if (TAB_IDS.includes(rest[0])) selectTab(rest[0]); else sys("Tabs: " + TAB_IDS.join(", "));
        break;
      case "reset-code": files = { ...STARTERS }; saveFiles(); selectTab(activeTab); sys("Workbook reset."); break;
      case "run": runPreview(); break;
      default: sys("Unknown command. /help for a list.");
    }
    return;
  }

  line("user", text);
  send(text);
});

function banner() {
  sys(`Welcome to clyde — Claude in a terminal, with a code workbook on the right.
Paste your API key above, then ask for something like:
  "build a pomodoro timer with html/css/js"
  "make a React todo app"
  "write a README for this in the markdown tab"
Type /help for commands.`);
}

// Init
refreshKeyStatus();
renderTabs();
selectTab(TAB_IDS.includes(activeTab) ? activeTab : "html");
banner();
input.focus();
