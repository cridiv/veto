# Veto Policy Authoring Guide

This document is the complete reference for writing `veto-policy.yaml` — the file that controls what every AI agent is allowed to do.

---

## Table of Contents

1. [How the Engine Reads Your Policy](#1-how-the-engine-reads-your-policy)
2. [Top-Level Structure](#2-top-level-structure)
3. [The `context` Block](#3-the-context-block)
4. [Anatomy of a Rule](#4-anatomy-of-a-rule)
5. [The `match` Block](#5-the-match-block)
6. [The `when` Expression](#6-the-when-expression)
7. [The `quota` Block](#7-the-quota-block)
8. [The `action` Directive](#8-the-action-directive)
9. [Evaluation Order & The Ratchet Invariant](#9-evaluation-order--the-ratchet-invariant)
10. [Complete Examples](#10-complete-examples)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. How the Engine Reads Your Policy

When Veto boots, it reads `veto-policy.yaml` from the repo root (or from the path in `VETO_POLICY_PATH`). The file is parsed and validated against a strict schema — the service **will not start** if the file is invalid.

At runtime, for every incoming agent tool call:

1. The engine filters all rules whose `match` targets the calling agent and tool.
2. Filtered rules are evaluated **top to bottom**, in the exact order they appear in the file.
3. For each rule: the `when:` condition is checked first, then `quota:`, then `action:` is applied.
4. The **first `allow`** with no quota or condition stops evaluation.
5. A **`block`** is always final — no later rule can undo it.

---

## 2. Top-Level Structure

```yaml
context:        # optional — shared values rules can reference
  key: value

policies:       # required — ordered list of rules
  - name: ...
  - name: ...
```

The file has two top-level keys: `context` (optional) and `policies` (required).

---

## 3. The `context` Block

`context` is a shared dictionary available to every `when:` expression via `context.<key>`.

Use it to define whitelists, thresholds, or any value you want to reference across multiple rules without repeating it.

```yaml
context:
  known_recipients:
    - "PHCN"
    - "Supplier Ltd"
    - "Amazon Web Services"
  max_single_transfer: 100000
```

**Accessing context in a `when:` expression:**

```yaml
when: "args.to not in context.known_recipients"
```

> **Note:** `context` values are read-only. They are set at load time and never modified at runtime.

---

## 4. Anatomy of a Rule

Every rule is a block under `policies:` with the following fields:

```yaml
- name: "unique-rule-id"          # required — machine-readable identifier
  description: "Human summary"    # optional — shown in logs and dashboard
  match:                          # required — who and what this rule targets
    agents: [...]
    tools: [...]
  when: "expression"              # optional — conditional trigger
  quota:                          # optional — sliding-window limit
    window: "1h"
    count: 10
  action: allow                   # required — what to do when the rule fires
```

All fields except `name`, `match`, and `action` are optional.

---

## 5. The `match` Block

`match` scopes a rule to specific agents and tools. **Both are required inside `match`** unless `agents` is omitted (which defaults to `*`).

### `agents`

```yaml
match:
  agents: ["acme-assistant"]      # specific agent
  agents: ["bot-a", "bot-b"]      # multiple agents
  agents: ["*"]                   # all agents (explicit wildcard)
  # agents omitted = same as ["*"]
```

| Value | Meaning |
|---|---|
| `["*"]` | Matches every agent |
| `["agent-id"]` | Only matches that exact agent ID |
| `["a", "b"]` | Matches either agent |
| *(omitted)* | Same as `["*"]` |

### `tools`

```yaml
match:
  tools: ["transfer_money"]                          # single tool
  tools: ["read_inbox", "read_file", "list_files"]   # multiple tools
  tools: ["*"]                                       # all tools (wildcard)
```

> `tools` does **not** default to `*` when omitted — it is required. Use `["*"]` explicitly for a catch-all rule.

---

## 6. The `when` Expression

`when:` is an optional boolean expression. If present, the rule only fires when the expression evaluates to `true`. If absent, the rule always fires for matching agents/tools.

The expression is evaluated against two namespaces:

| Namespace | Source |
|---|---|
| `args.*` | The tool's arguments from the incoming request |
| `context.*` | Your `context:` block in the policy file |

### Supported Operators

#### Numeric Comparisons

Compare a numeric argument to a literal number.

```yaml
when: "args.amount > 100000"
when: "args.amount >= 50000"
when: "args.amount < 10"
when: "args.amount <= 999"
when: "args.amount == 0"
when: "args.amount != 100"
```

- The left-hand side must resolve to a number. String numbers (e.g. `"5000"`) are coerced automatically.
- The right-hand side must be a numeric literal (integer or decimal).

#### Array Membership

Check if an argument value is inside a list (typically from `context`).

```yaml
# True if args.to IS in the list
when: "args.to in context.known_recipients"

# True if args.to is NOT in the list
when: "args.to not in context.known_recipients"
```

- The right-hand side must resolve to an array. If the list is missing, `in` returns `false` and `not in` returns `true`.
- Comparison is strict equality (no type coercion).

#### String Prefix

Check if a string argument starts with a given prefix.

```yaml
# True if path starts with "/workspace/"
when: 'args.path startswith "/workspace/"'

# True if path does NOT start with "/workspace/"
when: 'not args.path startswith "/workspace/"'
```

- The prefix must be a double-quoted string literal inside the expression.
- If the argument is not a string, `startswith` returns `false` and `not … startswith` returns `true`.

### Expression Limitations

- **One operator per expression.** Compound conditions (`AND`, `OR`) are not supported — use multiple rules instead.
- The left-hand side must be a dotted path (`args.x` or `context.y`), not a literal.
- Expressions that cannot be parsed are **fail-closed** — the rule fires as if the condition were `true` (safer than silently skipping).

---

## 7. The `quota` Block

`quota` enforces a sliding-window limit. The engine counts or sums past **allowed** actions in SQLite and checks whether the current request would exceed the ceiling.

If the quota **is exceeded**, the rule's `action` is applied.
If the quota **is not exceeded**, evaluation falls through to the `action` directive normally.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `window` | string | ✅ | Time window — see formats below |
| `count` | number | one of | Maximum number of calls allowed in the window |
| `sum` | string | one of | Argument path to accumulate (e.g. `args.amount`) |
| `max` | number | required with `sum` | Ceiling for the accumulated sum |

Use **either** `count` **or** `sum + max`. Not both.

### Window Format

```
<integer><unit>

s  →  seconds     e.g.  30s
m  →  minutes     e.g.  10m
h  →  hours       e.g.  1h, 24h
d  →  days        e.g.  7d
```

### Count Quota (frequency cap)

Limits how many times a tool can be called within a window.

```yaml
quota:
  window: 10m
  count: 3
```

> "No more than 3 calls in any rolling 10-minute window."

### Sum Quota (value accumulation cap)

Sums a numeric argument across past allowed calls and enforces a ceiling.

```yaml
quota:
  window: 1h
  sum: args.amount
  max: 300000
```

> "No more than ₦300,000 transferred in any rolling hour."

The `sum` field supports dotted paths: `args.amount`, `args.size_bytes`, `args.records_exported`, etc.

---

## 8. The `action` Directive

`action` determines what Veto does when a rule matches. It is **always required**.

| Action | Verdict returned | Meaning |
|---|---|---|
| `allow` | `allow` | Permit the tool call immediately. No further rules are evaluated. |
| `block` | `block` | Deny the tool call. Final — cannot be overridden by any later rule. |
| `require_approval` | `needs_approval` | Pause the tool call and create a pending approval for a human to resolve. |
| `judge` | `needs_approval`* | Route to the LLM Intent Judge for automated reasoning. |

> \* `judge` currently stubs to `needs_approval` while the LLM judge is being wired. Once live, it will return `allow` or `block` based on the judge's confidence score.

---

## 9. Evaluation Order & The Ratchet Invariant

### Order

Rules are evaluated **strictly top-to-bottom**. Put your most specific or most permissive rules first.

```yaml
policies:
  - name: allow-read-tools       # checked first
  - name: block-outside-sandbox  # checked second
  - name: default-catchall       # checked last
```

### The Ratchet Invariant

This is Veto's core security guarantee:

> **A later rule can only keep or tighten a decision — never loosen it.**

The verdict severity order is:

```
allow  →  needs_approval  →  block
  0            1               2
```

- If rule A produces `needs_approval` and rule B would produce `allow`, the final verdict stays `needs_approval`.
- If rule A produces `block`, evaluation stops immediately. No subsequent rule can change it.

This means an `allow` rule later in the file cannot override an earlier `block`. A confused or compromised judge cannot undo a hard block from a rule.

### First-Match-Wins for `allow`

An explicit `allow` action without a `quota` breaks out of the evaluation loop immediately — no further rules are checked. This is intentional: read-only tools should return fast.

```yaml
- name: allow-read-tools
  match:
    tools: [read_inbox, read_file, list_files]
  action: allow   # stops here — nothing below is checked for these tools
```

---

## 10. Complete Examples

### Allow all read-only tools

```yaml
- name: allow-read-tools
  description: "Read-only tools need no scrutiny"
  match:
    agents: ["*"]
    tools: [read_inbox, read_file, list_files, search_web]
  action: allow
```

### Block a tool entirely for all agents

```yaml
- name: block-drop-database
  description: "No agent may ever drop a database"
  match:
    tools: [drop_database]
  action: block
```

### Require approval for large single transfers

```yaml
- name: large-transfer-approval
  description: "Require human review for transfers over ₦100,000"
  match:
    agents: [acme-assistant]
    tools: [transfer_money]
  when: "args.amount > 100000"
  action: require_approval
```

### Require approval for unknown recipients

```yaml
context:
  known_recipients:
    - "PHCN"
    - "Supplier Ltd"

policies:
  - name: unverified-recipient-approval
    description: "Flag transfers to unlisted accounts"
    match:
      agents: [acme-assistant]
      tools: [transfer_money]
    when: "args.to not in context.known_recipients"
    action: require_approval
```

### Hourly cumulative spending cap

```yaml
- name: hourly-transfer-cap
  description: "Max ₦300,000 in cumulative transfers per hour"
  match:
    agents: [acme-assistant]
    tools: [transfer_money]
  quota:
    window: 1h
    sum: args.amount
    max: 300000
  action: require_approval
```

### Rate-limit destructive operations

```yaml
- name: devops-deletion-rate-limit
  description: "DevOps bot: max 3 file deletions per 10 minutes"
  match:
    agents: [devops-bot]
    tools: [delete_files]
  quota:
    window: 10m
    count: 3
  action: block
```

### Block file deletions outside a sandbox path

```yaml
- name: block-sandbox-escape
  description: "Only allow deletions inside /workspace/"
  match:
    tools: [delete_files]
  when: 'not args.path startswith "/workspace/"'
  action: block
```

### Catch-all: route unmatched tool calls to the judge

```yaml
- name: default-unmatched
  description: "Any unmatched tool call goes to the LLM Intent Judge"
  match:
    tools: ["*"]
  action: judge
```

> Always put this rule **last**. Because it matches every tool, no rule below it would ever be reached.

---

## 11. Common Mistakes

### Forgetting `tools` in `match`

```yaml
# WRONG — schema validation will reject this
match:
  agents: [acme-assistant]
  # tools is missing
```

`tools` is always required. Use `["*"]` if you mean all tools.

---

### Using `sum` without `max`

```yaml
# WRONG — schema validation will reject this
quota:
  window: 1h
  sum: args.amount
  # max is missing
```

`sum` and `max` must always be specified together.

---

### Putting a catch-all `allow` before specific blocks

```yaml
# WRONG — block-dangerous-tool is never reached
policies:
  - name: allow-everything
    match:
      tools: ["*"]
    action: allow           # stops evaluation here

  - name: block-dangerous-tool
    match:
      tools: [drop_database]
    action: block           # never reached
```

Put permissive catch-alls at the **bottom**, after all specific rules.

---

### Compound conditions in `when`

```yaml
# NOT supported
when: "args.amount > 100000 AND args.to not in context.known_recipients"
```

Split this into two separate rules. The ratchet invariant ensures both conditions contribute correctly to the final verdict:

```yaml
- name: large-amount-check
  match:
    agents: [acme-assistant]
    tools: [transfer_money]
  when: "args.amount > 100000"
  action: require_approval

- name: unverified-recipient-check
  match:
    agents: [acme-assistant]
    tools: [transfer_money]
  when: "args.to not in context.known_recipients"
  action: require_approval
```

---

### Relying on `allow` to override an earlier block

```yaml
policies:
  - name: block-tool
    match:
      tools: [dangerous_tool]
    action: block

  - name: try-to-unblock   # WRONG — the ratchet prevents this
    match:
      tools: [dangerous_tool]
    action: allow           # has no effect; block is already final
```

Once a `block` is set, it cannot be undone. This is by design.

---

*For client integration and tool wrapping, see the [TypeScript SDK Guide](SDK.md).
For expression evaluator internals, see [`backend/src/engine/evaluators/rule-evaluator.ts`](../backend/src/engine/evaluators/rule-evaluator.ts).
For the quota sliding-window implementation, see [`backend/src/db/evaluators/quota-evaluator.ts`](../backend/src/db/evaluators/quota-evaluator.ts).*

