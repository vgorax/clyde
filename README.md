# clyde

A terminal-style Claude chat (left) paired with a live code workbook (right).
Ask Claude to build something; it writes code straight into the workbook tabs
(HTML, CSS, JavaScript, Markdown, React) and the preview updates.

## Run

It's a static site with no build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Paste your Claude API key in the top bar (from console.anthropic.com → API keys).
It's used for this tab only. Close or reload the tab and the key, chat and code are gone.

## How it works

- Calls the Claude API directly from the browser with the official `@anthropic-ai/sdk`
  (loaded from jsDelivr, `dangerouslyAllowBrowser: true`).
- Claude gets a `write_code` tool; each call replaces one workbook tab. Code streams into
  the editor live as Claude writes it.
- Every message you send includes the workbook's current contents, so Claude sees your edits.
- HTML + CSS + JavaScript render together in a sandboxed iframe; React runs through
  Babel standalone; Markdown renders with `marked`.
- Default model is `claude-opus-5-5`; switch in the top bar or with `/model sonnet|haiku`.

## Commands

`/help`, `/clear`, `/model <opus|sonnet|haiku>`, `/tab <id>`, `/run`, `/reset-code`.
Ctrl/Cmd+Enter in the editor re-runs the preview.

## Security note

Session only: your key, conversation, and workbook code live in the page's memory and
nothing is written to localStorage, sessionStorage, cookies, or IndexedDB. Closing or
reloading the tab clears everything (use **save** first if you want to keep code).
The key is only sent to `api.anthropic.com`. Don't host this page publicly with a key baked in.
