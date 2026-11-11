# Judge instructions — brief-forge

Two levels, five minutes each. **Level 1** demonstrates the product entirely
inside Atlassian (Rovo Chat + Jira): nothing to install on your machine.
**Level 2** connects an external MCP client ([CC] or Cursor) to the same
server. Level 1 is the demo; Level 2 is the proof that this is a real MCP
server, not a chat wrapper.

Honest status first, so you know what you are looking at:

| Area | Status at submission |
|---|---|
| MCP server + 11 tools (`rovo:mcp`) | implemented |
| Brief construction, budgets, sourcing | implemented |
| Readiness scoring | implemented |
| Security layer (quoting, rules, masking, permissions) | implemented |
| Jira UI (banner, project page, settings) | implemented |
| Rovo skill + Rovo agent | implemented, demoed in Rovo Chat |
| External MCP clients (Level 2) | **works in our test site; requires admin activation on your site — see §3** |
| Screenshots / video | produced during demo week (see `VIDEO-SCRIPT.md`) |

Everything below assumes the app is already deployed and installed on the site
(see the README's *Installation* section). The demo project is `PAY`, the demo
ticket is `PAY-123`.

---

## Level 1 — Full demo in Rovo Chat (no setup)

Open Rovo Chat in your Atlassian site and make sure the **brief-forge** agent
(or the *work-brief* skill) is selected. Three prompts tell the whole story.

### 1.1 "Prepare PAY-123 for an agent"

> **You:** Prepare PAY-123 for an agent.
>
> **brief-forge:** PAY-123 — *Refund of a partially captured payment fails*.
> Readiness **45/100 — needs precision**. Three gaps:
> - **No verifiable acceptance criteria** (−30): the description says "the
>   refund should work", which cannot be checked.
> - **Unanswered question** (−10): a comment from 4 Nov asks whether the
>   partial-refund path should reuse `captureId`; no reply.
> - **No component identified** (−10): no component is set, so I cannot attach
>   the zone's recent changes.
>
> Fix those three and I can build a usable brief.

**What to look at:** every gap names a criterion, a point cost and a reason.
This is the score doing its job: blocking the launch of an agent on a ticket
that would waste its time.

### 1.2 "What's missing from this ticket?"

> **You:** What's missing from this ticket?
>
> **brief-forge:** Same three gaps, plus the *fix list*:
> 1. Write acceptance criteria as checkable statements (I suggest three,
>    derived from the description — they are proposals, not facts).
> 2. Answer the `captureId` question in a comment.
> 3. Set the component to `payments-refunds`.

**What to look at:** the tool returns the same gaps as the Jira banner. Same
handler, same data — the Jira UI and the MCP server cannot disagree.

*Live variant:* fix the three items in Jira, then ask again. The score climbs
above 70 and the status becomes **ready**. The brief is marked for rebuild and
is fresh again within two minutes.

### 1.3 "What did the agent do on PAY-123?"

> **You:** What did the agent do on PAY-123?
>
> **brief-forge:** One recorded attempt (4 Nov, agent `claude-code`, on behalf
> of *you*), status **partial**:
> - **Done:** the `captureId` reuse path; a unit test reproducing the failure.
> - **Not done:** the refund of a *second* partial capture — the test still
>   fails there.
> - **Criteria covered:** 1, 2.
> - **Tests:** `npm test -- refunds` → 1 failing.
> - **Follow-ups proposed:** handle the multi-capture case, then re-run.
>
> The brief for this ticket now opens its *Already tried* section with this
> attempt.

**What to look at:** the loop is closed. The next agent does not restart from
zero, and it does not re-try the approach that already failed.

### 1.4 Optional — the Jira side

Open `PAY-123`: the banner shows the score, the status and the gaps, with a
**Prepare for an agent** button. Open the project's **brief-forge** page: issues
are ranked by readiness — what is ready to hand to an agent, and what must be
clarified first.

---

## Level 2 — Connect an external MCP client

The same 11 tools, called from your own coding agent. The server is the Forge
app's `rovo:mcp` module, exposed by Atlassian at:

```
https://mcp.atlassian.com/forge/<appId>
```

`<appId>` is the Forge app id (the `app.id` in `manifest.yml`, also shown by
`forge settings list`). It is **not** a secret, but it is site-specific — use
the one from the site where the app is installed.

### 2.1 Administrator activation (once per site)

An Atlassian **administrator** must allow the app to act as a connected app
before any external client can authenticate:

1. **Administration → Apps → Sites → Connected apps** (in some tenants:
   **Settings → Apps → Connected apps**).
2. Find **brief-forge** in the list of apps requesting MCP access.
3. **Allow / Authorize** it, and confirm the scopes it requests (read Jira
   issues, comment on issues, read Confluence pages).

> If you do not see the app there, the app is not installed on this site, or
> your tenant does not yet expose the connected-apps screen for Forge MCP
> modules. In that case, use Level 1 — the product demonstration is identical,
> only the transport differs.

### 2.2 OAuth 2.1

Authentication is **OAuth 2.1** with PKCE, brokered by Atlassian:

- On the first call, the client opens a browser window pointing at Atlassian.
- You sign in and consent to the scopes above.
- The client stores the resulting token; refresh is handled by the client.
- **Every tool call then runs with *your* permissions.** If you cannot see
  `PAY-123` in Jira, `get-work-brief` returns a refusal with **no ticket
  content** — that is deliberate, not a bug.

No client secret is ever copied into a config file, and brief-forge never sees
your Atlassian credentials.

### 2.3 [CC] — command to copy

```bash
claude mcp add --transport http brief-forge \
  https://mcp.atlassian.com/forge/<appId>
```

Then, inside [CC]:

```
/mcp
```

Pick `brief-forge`, choose **Authenticate**, complete the browser consent.
Verify:

```
List the brief-forge tools.
```

You should see the 11 tools listed below. First real call:

```
Call get-work-brief with issueKey "PAY-123" and budget "s".
```

**Expected:** a brief of **at most 1 100 tokens**, every item carrying a source
and a date, and — if a section was cut — a line naming the tool that gives the
rest (e.g. *"4 more decisions not shown: `get-related-decisions`"*).

*If your [CC] version predates HTTP transport support*, register it through a
stdio bridge instead:

```bash
claude mcp add brief-forge -- npx -y mcp-remote \
  https://mcp.atlassian.com/forge/<appId>
```

### 2.4 Cursor — command to copy

Add the server to your MCP config (`~/.cursor/mcp.json` for global, or
`.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "brief-forge": {
      "url": "https://mcp.atlassian.com/forge/<appId>"
    }
  }
}
```

Restart Cursor, then open **Settings → MCP**: `brief-forge` should be listed
with a **Connect / Authenticate** action. Complete the browser consent, and the
11 tools become available in Agent mode.

*Older Cursor builds without native remote MCP* — use the stdio bridge:

```json
{
  "mcpServers": {
    "brief-forge": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.atlassian.com/forge/<appId>"]
    }
  }
}
```

### 2.5 Suggested Level 2 walkthrough (2 minutes)

1. `check-readiness` on `PAY-123` → score 45, three explained gaps.
2. `get-work-brief` with `budget: "s"` → ≤ 1 100 tokens, sourced.
3. `claim-work` with `agentName: "cursor"` → reservation, 4 h.
4. Do (or pretend to do) the work; then `post-work-report` with
   `status: "partial"`, `criteriaCovered: "1,2"`, `testsPassed: "1 failing"`.
5. Look at `PAY-123` in Jira: signed comment + banner.
6. Call `get-work-brief` again: *Already tried* now opens with that report.

That last step is the whole point of the product, seen from an external client.

---

## The 11 tools

| Tool | Kind | Inputs | What it returns |
|---|---|---|---|
| `get-work-brief` | read | `issueKey`, `budget` (`s`\|`m`\|`l`) | The budgeted, sourced brief |
| `check-readiness` | read | `issueKey` | Score 0–100, status, gaps with points and reasons |
| `get-acceptance-criteria` | read | `issueKey` | Criteria only, numbered |
| `get-related-decisions` | read | `issueKey` | Decision records (title, page, date, link) |
| `get-failed-attempts` | read | `issueKey` | Previous attempts and why they stopped |
| `get-neighbor-changes` | read | `issueKey` | Recent PRs/commits in the same zone |
| `list-ready-work` | read | `projectKey` | Issues scoring ≥ 70 |
| `ask-clarification` | write | `issueKey`, `question` | Comment posted on the issue |
| `post-work-report` | write | `issueKey`, `status`, `report`, `criteriaCovered`, `testsPassed` | Signed comment + issue banner |
| `record-failed-attempt` | write | `issueKey`, `summary`, `reason` | Attempt stored; next brief opens with it |
| `claim-work` | write | `issueKey`, `agentName` | Reservation, 4 h expiry |

Write tools **never** change status, assignee or fix versions. That is a hard
rule, not a setting.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Tools not listed in the client | app not installed on this site, or admin activation missing | install it, then §2.1 |
| Browser consent loops | wrong site signed in | sign out of Atlassian, retry, pick the site where the app is installed |
| `permission denied` with no content | your account cannot see the issue | use an account with access — the refusal is by design |
| Brief says `stale: true` | issue changed; rebuild did not fit in the 55 s action window | call again after ~2 min; freshness target is < 2 min |
| Brief says a section was truncated | token budget reached | call the tool named in the truncation line (`get-related-decisions`, …) or use a bigger budget |
| Nothing at all works | no Forge app deployed on this site | fall back to Level 1 — same product, inside Atlassian |

## What to keep in mind

- **The brief is not a summary.** It is a *sourced* artifact: every line has an
  author and a date, and hostile content is quoted as data, not executed.
- **The budget is a promise.** `s` means ≤ 1 100 tokens, and a cut section
  always says so and names the tool that gives the rest.
- **The loop is the product.** Readiness in, work report out, work report in
  the next brief. A demo that stops at step 1.2 shows half of it.
