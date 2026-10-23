# Lighthouse · dsh-lighthouse

[中文](README.md) · **English**

A DeepSeek Harness tab that **reads the current session and points out the actions that are hard to undo.**

An agent can do a lot before you look up: delete a folder, force-push a branch, read a key file, kill every process with one name. The log remembers, but nobody reads it line by line afterwards. Lighthouse gives that log a second pass. For each risky action it shows what was touched, what could break, and a safer way to do the same job.

It is read-only. It does not block tools, change a command, or run anything again.

![Lighthouse tab showing a sample session report](https://testingcf.jsdelivr.net/gh/xh0915/dsh-lighthouse@0c06cae/design/lighthouse-en.png)

*Sample session, not a live run: the seven demo findings, one per risk rule.*

## What you see once installed

Open a conversation and pick the **Lighthouse** tab at the top.

### Seven numbers

Events checked, commands, file operations, findings, and how many are critical, worth a warning, or just a notice. All counted from the log. Nothing is estimated.

The chips next to the title also tell you how many rules ran, which event the scan reached, and whether anything was masked.

### The findings

Each card answers four questions in plain words:

- **What happened** — the rule, a short qualifier such as *broad* or *force*, and the turn it came from.
- **What was touched** — the path, file, process name, table, or host. Plus the command or file tool as it was logged.
- **Why it matters** — what makes it hard to undo.
- **What to do instead** — a concrete safer move.

The footer says whether the action **succeeded**, **failed**, or has an **unknown** result. A failed attempt may have done nothing, but it can still be retried. An unknown result is not called a success. The event number points back to the exact line in the session log.

Identical actions are merged. A card shows how many times it appeared and the first and last turn, so repetition is visible without seven copies of the same command.

### Filters and export

- Filter the list by **Critical**, **Warning**, or **Notice**.
- **Copy report** puts a Markdown report on your clipboard.
- **Download report** saves `lighthouse-<session>.md`.
- **Refresh** scans the session again, which is useful after the agent keeps working.

The report uses the same words as the page. If the list was capped, the report says so.

## What it looks for

Seventeen rules, in seven groups.

### Deletes

`rm -rf`, `del /s`, `rd /s`, `Remove-Item -Recurse`, `ri`. A recursive delete is **critical** when the target is broad (`/`, a home folder, a drive, `C:\Windows`, the workspace itself, `.git`), **notice** when every target is a rebuildable folder such as `node_modules`, `dist`, or `.cache`, and **warning** otherwise. Non-recursive deletes are ignored.

### Git

- `git clean -f` — warning; clearing ignored files too (`-x`) is critical. `git clean -n` is ignored.
- `git reset --hard` — critical.
- `git checkout -- .`, `git checkout .`, `git checkout -f`, `git restore` — warning. `git restore --staged` alone is not flagged.
- Force push — critical for `--force`, `+refspec`, or mirroring; warning for `--delete`; a **notice** for `--force-with-lease`, because it still replaces the remote branch but checks for newer work first.

### Processes

`taskkill /IM`, `Stop-Process -Name`, `killall`, and `pkill` without `-x`. Killing by name hits every process with that name, not just yours. The severity is **critical** for names that look like an editor, terminal, Node, or the Harness itself, and **warning** for other names. Killing one PID is ignored.

### Credentials

- Printing a credential file (`cat`, `grep`, `Get-Content`, …) — critical.
- Copying one locally (`cp`, `copy`) — warning, because the secret now exists in a second place.
- Sending one off the machine (`scp`) — critical.
- A file tool `read` of a credential file — critical.
- A file tool `write` or `edit` of a credential file — warning.

Templates and public keys are left alone: `.env.example`, `*.sample`, `*.template`, `id_rsa.pub`. A file named `credentials.ts` is source code, not a credential file.

### Databases

`DROP TABLE/DATABASE/SCHEMA`, `TRUNCATE`, `DELETE FROM` without a `WHERE`, and `db.dropDatabase()` through common SQL clients. Always critical. These are only matched when the command actually starts a SQL client, so `echo "DROP TABLE users"` is not a finding.

### System and package managers

`sudo` / `runas` — notice. `chmod 777` and `icacls … /grant Everyone` — warning. Global git or package-manager config, `setx`, and persistent environment changes — warning. Global package installs — notice. `docker … prune` — warning. `format C:`, `mkfs`, and `diskpart clean` — critical.

### Network

`curl | sh` (and `wget`, `iwr`, `irm` piping into a shell or interpreter) — critical, with the host shown. It only matches when the download command starts the line, so a string inside `echo` does not trigger it.

## How it avoids crying wolf

A scanner that flags everything is worse than no scanner, so the detector is deliberately narrow:

- Commands are split on `;`, `&&`, `||`, and newlines **outside quotes**, so a path or message containing `;` stays one command.
- System, database, and pipe rules only fire when the command starts with the real program. Mentioning `DROP TABLE` or `curl | sh` in prose does nothing.
- Unix absolute paths such as `/home` and `/srv` are treated as paths, not as Windows switches.
- A long PowerShell switch is not read as a bag of single letters: `-Force` does not contain `-Recurse`.
- Examples, templates, public keys, `git clean -n`, `git restore --staged`, `pkill -x`, and single-PID kills are ignored on purpose.
- A command that failed is still reported, but labeled as failed. The page never pretends it took effect.
- Identical successful, failed, and unknown actions stay separate, because they mean different things.

## Privacy

Everything happens on your machine.

- Only the current session log is read, through Harness's own `sessionQuery`.
- Secrets are masked **before** the report crosses to the page: private key blocks, JWTs, GitHub / AWS / Google / Slack / npm / PyPI / Stripe / DeepSeek-shaped keys, `Bearer` headers, credentials inside URLs, `api_key = …` assignments, and email addresses become `«已脱敏»`.
- The page reports how many spans were masked and which families fired. It does not show the secrets.
- The title, the goal, every command, and every path are masked with the same pass.
- Masking is on by default. If you turn it off, the page says so.
- Nothing is uploaded. The plugin makes no model request, no shell call, and no telemetry call.

## Install

Requires Node.js 22.19+ (or 24+) and DeepSeek Harness 0.1.0-rc.6+.

```sh
git clone https://github.com/xh0915/dsh-lighthouse
cd dsh-lighthouse
pnpm install
pnpm run build
dsh plugin --profile web add .
```

Restart the Web Harness. Open a conversation and the **Lighthouse** tab is there.

**Run `pnpm run build` before `add`.** The package ships no install-time build script (pnpm 10 blocks unapproved `prepare` scripts); skip this step and the plugin installs but fails to load.

Remove it with:

```sh
dsh plugin --profile web remove dsh-lighthouse
```

## Settings

```yaml
dsh-lighthouse:
  redactSecrets: true   # mask secrets before they reach the page (default)
  maxFindings: 50       # findings kept, 5–200
```

When a session has more findings than the budget, the first ones are kept and the page and the report both say the list was truncated. Nothing disappears silently.

## Boundaries

- **Only what the log proves.** A finding exists because a tool call matches a rule. Lighthouse does not infer risk from a sentence the model wrote.
- **Read-only.** It cannot block a tool, edit a command, or approve anything. It is a second pass over actions that already happened.
- **One session at a time.** It scans the conversation you are looking at, not your whole history.
- **Shell and file-tool actions.** Custom tools that wrap a shell are only seen if their arguments include `command` (shell tools) or `file_path` (read/write/edit tools).
- **No auto-fix.** A safer move is advice, not a button that runs it.
- **No cost figure.** The log has no price, so the plugin does not guess one.
- The UI follows Harness light and dark themes, and speaks Chinese and English.

## Technical details

<details>
<summary>For people changing the code</summary>

### Layout

```text
package.json           # dsh.bundle.patch + dsh.client, scripts, peer deps
cordis.patch.yml       # mounts the host plugin row into a profile
dsh.plugin.json        # registry manifest
src/index.ts           # host entry: Config schema, runtime, Typert manifest
src/runtime.ts         # lighthouse.scan(sessionId)
src/detect.ts          # session log -> findings (rules, dedupe, outcomes, redaction)
src/rules.ts           # the closed rule id list, shared with the browser
src/schema.ts          # Zod wire authority (types inferred, nothing drifts)
src/contract.ts        # strict InvocationDescriptor shared by host and client
src/typert.ts          # host reflection manifest
src/redact.ts          # local secret redaction
src/client/index.tsx   # client entry: mounts the Remote, registers the tab
src/client/view.tsx    # the Lighthouse view
src/client/catalog.ts  # rule/variant/severity ids -> dictionary keys
src/client/report.ts   # Markdown report builder
src/client/styles.ts   # theme-token stylesheet (follows Harness light/dark)
src/client/locales.ts  # zh / en copy
tests/                 # detector, report, catalogue, contract, client-entry tests
build.mjs              # esbuild dual build: host ESM + client wrapped for the web loader
```

The host sends ids and evidence, not prose. The browser owns every label. `catalog.ts` maps each id to a dictionary key at compile time, so a missing translation fails the build instead of appearing as `rule.git-reset-hard.safe` on screen.

### Development

```sh
pnpm run check   # typecheck + lint + test + build
```

The detector is the part to test hardest. Its fixtures build logs from the same event shapes the Harness emits (`tool/call`, `tool/result`, `turn/start`, `user/message`, `session/title`), and the suite checks not only what is flagged but also what is deliberately left alone.

### Renaming

If you fork this and rename it, keep these in sync: `package.json` → `name`, `exports`, `files`; `build.mjs` → the `__ModuleLoader__.load` id; `src/index.ts` → `name`; `src/client/remote.ts` → the hex-encoded `TypertRemoteNamespace$…` name; `src/client/locales.ts` → the locale namespace; `src/client/index.tsx` → the slot id; `src/typert.ts` → `package`; `src/contract.ts` → the invocation id; `cordis.patch.yml` → `id` and `name`; `dsh.plugin.json` → `id`.

</details>

## License

MIT

Built by [里卡多 / xh0915](https://xh0915.github.io)
