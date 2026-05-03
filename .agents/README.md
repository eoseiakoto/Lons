# Agent Profiles — Lōns Platform

This directory contains role definitions for the four Claude agents working on the Lōns platform. Each agent runs in its own Cowork session, mounting the same `Lons/` workspace.

## Structure

```
.agents/
├── README.md              ← You are here
├── shared/
│   └── PROJECT-CONTEXT.md ← Shared context all agents should read first
├── ba/
│   └── AGENT.md           ← Business Analyst role definition
├── pm/
│   └── AGENT.md           ← Product Manager role definition
├── dev/
│   └── AGENT.md           ← Developer role definition
└── de/
    └── AGENT.md           ← Deployment Engineer role definition
```

## How to Use

When starting a new Cowork session for any agent, tell the agent to read its profile:

**For BA:**
> Read `.agents/shared/PROJECT-CONTEXT.md` and `.agents/ba/AGENT.md` — you are the Business Analyst for this project.

**For PM:**
> Read `.agents/shared/PROJECT-CONTEXT.md` and `.agents/pm/AGENT.md` — you are the Product Manager for this project.

**For Dev:**
> Read `.agents/shared/PROJECT-CONTEXT.md` and `.agents/dev/AGENT.md` — you are the Developer for this project.

**For DE:**
> Read `.agents/shared/PROJECT-CONTEXT.md` and `.agents/de/AGENT.md` — you are the Deployment Engineer for this project.

## Key Design Decisions

1. **Each agent has its own `.auto-memory/`** in its Cowork session. Agent-specific memories stay in that session's memory — not in this shared directory.

2. **Role definitions live here in the shared workspace** so all agents can read each other's scope if needed, and so Emmanuel can maintain a single source of truth for role boundaries.

3. **BA specs stay independent from PM decisions.** BA documents present options and trade-offs. PM decisions live in separate `Docs/PM-RESPONSE-*.md` files. Never merge them.

4. **No agent should store another agent's role definition in its own `.auto-memory/`.** Cross-agent awareness comes from reading this directory, not from duplicating role files.
