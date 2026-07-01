# MAYOR-GITHUB-GATE-ADR-1 — GitHub trigger policy (intent-based)

## Status

Accepted — implemented in `lib/mayor-github-invoke.ts` (`detectMayorGitHubToolRequest`).

## Context

After RAG-3, GitHub semantic retrieval works when Mayor enters the GitHub tool loop. A narrow keyword list in `detectMayorGitHubToolRequest()` only matched queries with specific verbs (e.g. «где **формируется** LLM call») and missed equivalent architectural questions («Где Routing?», «Где Shared Memory?»).

Mayor prompt already describes `code_audit` behavior, but **runtime gate** runs before the LLM and decides whether GitHub tools are wired at all.

## Decision

GitHub trigger is **intent-based**, not **component-list-based**.

A user message is a `code_audit` candidate when it expresses intent to **locate or inspect implementation in source** — regardless of whether the subsystem name was known when the gate was written.

### Positive signals (examples)

- «где реализовано / находится / хранится / формируется …»
- «как реализован / устроен / работает …»
- «каким образом работает …»
- «в каком файле …», «покажи код / реализацию …»
- Short «Где \<Subject\>?» when Subject looks like a code artifact (Latin identifiers or multi-word technical phrase), excluding office/building/personal «where» questions
- Existing GitHub/repo audit phrasing (unchanged for regression)

### Negative signals (must NOT trigger)

Conceptual / explanatory questions without code-location intent:

- «Что такое …?», «Объясни …», «Почему … полезен?», «Какие преимущества …?»
- English equivalents (`What is`, `Explain`, `Why`, `What are the advantages`)

### Non-goals

- No curated list of subsystem names (Routing, Debate, Workflow, …) as source of truth
- No changes to RAG, parser, Mayor prompt, or GitHub Connector

## Consequences

- Architectural «Где X?» queries open GitHub tools consistently
- Ordinary explanatory questions stay on the standard Mayor path (Reality Status Policy without tools)
- `coding_task` patterns unchanged and still take precedence

## Verification

`npx tsx scripts/verify_mayor_github_gate.ts`
