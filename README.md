# brief-forge

> **Sourced, budgeted context briefs for coding agents — straight from Jira.**

Serveur MCP Forge : briefs sourcés pour agents de code à partir de tickets Jira (Codegeist 2026).

brief-forge is an Atlassian **Forge** app with a built-in **MCP server**
(`rovo:mcp` module), built for **Codegeist 2026** — category *Apps for Software
Teams*.

It turns a Jira ticket into a **compact, source-cited brief** that a coding
agent can consume safely, then **receives the agent's work report back** — so
every pass enriches the context of the next one.

> ✅ **Status: deployed on a real Atlassian site.** The app (`08a89a5d-94d0-448f-
> 8c1a-70f938b2c3a8`) is built, deployed to `development` **and** `production`,
> and installed on Jira + Confluence of `one-atlas-cndz.atlassian.net`; it is
> *Runs on Atlassian* eligible. Its MCP endpoint answers with a proper OAuth 2.1
> challenge: `https://mcp.atlassian.com/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8`.
> Six defects were found **only** by deploying for real (they are fixed and
> listed in [`docs/DEPLOY.md`](docs/DEPLOY.md)). Code: 690 Jest tests green,
> `tsc --noEmit` clean, `forge lint` 0 errors; fidelity measured on 30 tickets ×
> 3 budgets in [`docs/FIDELITY-REPORT.md`](docs/FIDELITY-REPORT.md). Still to be
> played in a browser: the OAuth consent of a real MCP client and the admin
> activation of external exposure — see [Known limitations](#known-limitations).

---

## The problem

Coding agents (Claude Code, Cursor, Rovo agents…) fail on real tickets for a
boring reason: **missing or stale context**.

- The decision that ruled out the obvious approach lives in a Confluence page
  nobody linked.
- The previous attempt — and *why it was abandoned* — lives in 40 comments.
- The ticket itself is vague: no verifiable acceptance criteria, unbounded
  scope, a blocking link nobody noticed.

Result: the agent re-invents a rejected approach, burns tokens on the wrong
context, or silently guesses. And when it finishes, **nothing is written back**:
the next agent starts from zero.

## What brief-forge does

1. **Reads** the ticket, its comments, linked issues, attached Confluence
   decision pages and neighbor code changes (Teamwork Graph).
2. **Builds a brief** with a fixed section order — Objective, Acceptance
   criteria, Applicable decisions, Already tried, Neighbor changes,
   Constraints, Lessons, Who to ask, Gaps, Sources — where **every item carries
   one source and one date**, inside a token budget (`s` ≈ 1 000, `m` ≈ 3 000,
   `l` ≈ 8 000 tokens).
3. **Scores readiness** (0–100) with each lost point explained, so vague
   tickets get fixed *before* an agent is launched.
4. **Filters hostile content**: third-party text is quoted as data, secret
   patterns are masked, prompt-instruction patterns are dropped — and the drop
   is reported in the brief.
5. **Receives the work report** (status, done/not done, criteria covered,
   tests, follow-ups) as a signed Jira comment, stores attempts and lessons,
   and feeds them into the next brief.

## Demo in 5 steps

Screenshots land in `docs/assets/` during demo week (see `docs/ROADMAP.md`);
the live script is in `docs/VIDEO-SCRIPT.md` and judge-facing steps are in
`docs/JUDGE-INSTRUCTIONS.md`.

| # | Step | What you see |
|---|------|--------------|
| 1 | **Score the ticket** — ask Rovo Chat *"What's missing from PAY-123?"* (or open the issue banner) | Readiness **45/100 — needs precision**, three gaps explained: no verifiable criteria, unanswered question, no component |
| 2 | **Fix the gaps live** — answer the clarification comment, set the component | Score recomputed, gaps disappear, brief marked for rebuild |
| 3 | **Serve the brief** — a coding agent calls `get-work-brief` (budget `s`) | ≤ 1 100 tokens, every line sourced and dated, truncated sections name the tool that gives the rest |
| 4 | **Agent asks, then reports** — `ask-clarification` posts a question; `post-work-report` posts the report | Signed comment *"Written by an agent (client) on behalf of (user)"* + banner on the issue |
| 5 | **The loop closes** — `record-failed-attempt` on an abandoned try | The **next** brief opens its *Already tried* section with it — the agent no longer repeats the rejected approach |

## Architecture

```
                        manifest.yml (Forge)
                               │ declares
   ┌───────────────┬───────────┼────────────────┬─────────────────┐
   ▼               ▼           ▼                ▼                 ▼
 trigger ×4     consumer     action ×11      UI modules      rovo modules
 (Jira events:  (queue:      (MCP handlers)  jira:issue-     rovo:mcp
  updated,       rebuilds         │          Context         rovo:skill
  commented,     s/m/l briefs)    │          jira:project-   rovo:agent
  link created/        │          │          Page
  deleted)             ▼          ▼          jira:project-
   │  mark stale   ┌─────────────────────┐   SettingsPage
   │  + enqueue    │  sql (8 tables)     │
   └──────────────►│  llm (Forge AI:     │
                   │   condense + scan)  │
                   └──────────┬──────────┘
                              │
                        rovo:mcp server
                              │  OAuth 2.1
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
   Rovo Chat /          rovo:skill +           External MCP clients
   issue banner         rovo:agent             (Claude Code, Cursor…)
   (Atlassian)          (Atlassian)            mcp.atlassian.com/forge/<appId>
```

Full detail — modules, data flows, precomputation/invalidation, data model,
design rationale: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## The 11 MCP tools

| Tool | Kind | Purpose |
|------|------|---------|
| `get-work-brief` | read | The budgeted, sourced brief for an issue (`issueKey`, `budget`) |
| `check-readiness` | read | Readiness score with explained gaps |
| `get-acceptance-criteria` | read | Criteria only, numbered |
| `get-related-decisions` | read | Applicable decision records (page, date, link) |
| `get-failed-attempts` | read | Previous attempts and why they failed |
| `get-neighbor-changes` | read | Recent PRs/commits touching the same zone |
| `list-ready-work` | read | Issues scoring ≥ 70 in a project |
| `ask-clarification` | write | Post a question as a comment |
| `post-work-report` | write | Post the signed work report |
| `record-failed-attempt` | write | Record an abandoned attempt |
| `claim-work` | write | Reserve an issue for an agent (4 h expiry) |

Write tools are **bounded**: they comment, label and set properties — they
**never** change status, assignee or fix versions.

## Installation

Prerequisites: [Forge CLI](https://developer.atlassian.com/platform/forge/cli-reference/),
a registered Atlassian developer account, and a Jira Cloud site with Rovo
enabled for the Chat part of the demo.

```bash
# from the repository root (dependencies are vendored / lockfile committed)
forge register          # first time only — creates the app in your developer site
forge deploy            # builds and uploads the app
forge install --site <your-site>.atlassian.net --product jira
```

For the **external MCP clients** (Claude Code, Cursor), an administrator must
allow the app under **Apps → Sites → Connected apps**, then clients connect to
`https://mcp.atlassian.com/forge/<appId>` via OAuth 2.1. Step-by-step, with the
exact commands: [`docs/JUDGE-INSTRUCTIONS.md`](docs/JUDGE-INSTRUCTIONS.md).

## Configuration

Project-level settings live in the Jira project screen
(**Project settings → brief-forge**):

| Setting | Meaning | Example |
|---------|---------|---------|
| Trigger status | Issue status that starts brief precomputation | `Ready for agent` |
| Trigger label | Optional extra label to require | `ai-ready` |
| Acceptance-criteria field | Custom field holding the criteria | `Acceptance Criteria` |
| Decision labels | Confluence labels identifying decision pages | `decision`, `adr` |
| Component zone | Component ↔ Teamwork Graph zone mapping | `payments → checkout-svc` |
| Constraints text | Free-text project constraints injected in every brief | release-freeze rules |

## Security

Ticket content is **untrusted input**. brief-forge quotes it as data (never as
instructions), screens it with rules *then* a model, masks common secret
patterns, enforces the calling user's Jira permissions, bounds every write, and
keeps a 90-day access log. Threat model, counter-measures and — importantly —
**what is not covered**: [`docs/SECURITY.md`](docs/SECURITY.md).

## Known limitations

Honest list for a hackathon prototype:

- **Injection screening is best-effort.** Rules + model catch known patterns;
  a determined, obfuscated instruction can still slip through. The quoted-data
  framing and the human reviewer are the last lines of defense.
- **Secret masking covers 21 known formats** (OpenAI/Anthropic keys, GitHub
  PATs, Slack tokens, AWS keys, JWTs, PEM private keys, connection strings,
  `user:pass@` URLs, `password=`-style assignments…). The same pattern set is
  applied on the read path (brief) and the write path (reports). An exotic
  secret will still pass through.
- **Token counting is heuristic** (1 token ≈ 4 chars, ±10 % tolerance): budget
  `s` means ≤ 1 100 tokens, not an exact count.
- **Readiness scoring is a weighted heuristic**, not a measurement of truth.
- **Freshness is a target** (rebuild < 2 min after a change), dependent on
  trigger volume and queue throughput.
- **Agent identity is declarative** in `claim-work`: the claim reserves the
  issue, it does not authenticate the agent.
- **Never deployed to a real Atlassian site yet.** All behaviour is validated
  by 676 unit/integration tests against a simulated Jira, Confluence and
  Teamwork Graph (30 fixtures, 90 briefs measured — see
  [`docs/FIDELITY-REPORT.md`](docs/FIDELITY-REPORT.md)). The five live
  validations of the spec are still to be run: see
  [`docs/DEPLOY.md`](docs/DEPLOY.md) § 7.
- **LLM condensation is not wired to a live model.** Without a model the
  condenser returns the source text unchanged (sources and dates preserved), so
  briefs are faithful but less compact than they could be.

## Repository layout

```
manifest.yml               Forge manifest (modules below)
src/types.ts, config.ts    shared types, budgets, weights (core)
src/security.ts            core primitives: masking, injection patterns
src/util/                  dates, tokens, markdown, errors (core)
src/collect|brief|readiness|storage|security|actions|events|ui|index.ts
skills/, public-skill/     Rovo skill + open SKILL.md for external clients
docs/                      CONTRACT, ARCHITECTURE, SECURITY, JUDGE-INSTRUCTIONS,
                           VIDEO-SCRIPT, ROADMAP, RECETTE
test/                      unit tests per module (no network)
```

Docs: [CONTRACT](docs/CONTRACT.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) ·
[SECURITY](docs/SECURITY.md) · [JUDGE-INSTRUCTIONS](docs/JUDGE-INSTRUCTIONS.md) ·
[VIDEO-SCRIPT](docs/VIDEO-SCRIPT.md) · [ROADMAP](docs/ROADMAP.md) ·
[RECETTE](docs/RECETTE.md)

## License

MIT — see `package.json`. Built for Codegeist 2026 by BaptisteFaisy.
