# Media Trainer — Project Context for Claude

## What this product is

Media Trainer is a white-label AI press-coaching platform. PR firms license it, brand it, and use it to train their executive clients for live media interviews. A trainer at the firm configures the AI's coaching behavior; trainees run simulated press sessions against an AI journalist persona; post-session analytics surface a Baseline Score and actionable feedback.

This is an **Expert-in-the-Loop** engine. The core IP is the translation of human coaching expertise into AI behavior. The trainer is not a passive reviewer — they configure how the AI coaches. Every AI critique, real-time flag, and feedback summary must be "on-brand" for the firm's house methodology.

## Hard constraints (non-negotiable)

### Latency budget — ENGINEERING PRIORITY ONE
**End-to-end latency from user-stops-talking → AI-starts-speaking: 500–800 ms ceiling.** Above 800 ms the UX breaks. This is not a target; it is a pass/fail constraint. Every architecture decision must respect it.

Implications:
- TTS must stream sentence-by-sentence (do not wait for full LLM response).
- LLM streaming must be cut early and fed to TTS immediately.
- STT should be edge-proxied to minimize round-trip.
- When latency is unavoidable, render a visible "thinking" indicator so the user does not talk over the AI mid-generation.

### Security
- **No client-side API keys — ever.** Anthropic, OpenAI, and ElevenLabs are all proxied behind `app/api/*` routes. Keys live only in Vercel environment variables.

### TypeScript
- `strict: true` throughout. No `any`. No exceptions.

### Rendering
- Server Components are the default. Add `"use client"` only when strictly required (event handlers, browser APIs, stateful hooks).

### Vendor count
- **Exactly 5 vendors: Vercel, Supabase, Anthropic, OpenAI, ElevenLabs.** Do not propose a sixth. Use what you have.

### Reference repo
- The Electron handoff at `C:\Users\marka\OneDrive\Documents\Podcast_Trainer_Handoff` is read-only reference material. Mine it; never edit it. See `docs/MIGRATION_MAP.md` for what is worth porting.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 strict |
| Database / Auth / Storage | Supabase (Postgres + Auth + Storage) |
| LLM | Anthropic (claude-sonnet-4-6 default; claude-opus-4-7 for deep analysis) |
| STT | OpenAI Whisper (via `/api/stt`) |
| TTS | ElevenLabs (streaming, sentence-by-sentence) |
| VAD | `@ricky0123/vad-web` in-browser |
| Hosting | Vercel (Edge Functions where latency-critical) |
| Styling | Tailwind CSS v4 |
| Testing | Vitest (unit/integration) + Playwright (E2E) |

## Data model (3-tier)

```
Organization (PR firm / licensee)
  └─ white_label_config (logo, brand colors, custom domain)
  └─ Trainer (coach account at the firm)
       └─ framework_portal_entries (coaching frameworks, red-flag triggers, feedback templates)
       └─ Trainee (executive client)
            └─ Session
                 └─ session_turns (STT transcript + AI responses)
                 └─ session_score (BaselineScore + sub-scores)
```

## Directory conventions

```
app/
  (auth)/              — login / onboarding routes
  (trainer)/           — trainer dashboard + Framework Portal
  (trainee)/           — session start, live session, history
  api/
    stt/               — OpenAI Whisper proxy
    tts/               — ElevenLabs streaming proxy
    llm/               — Anthropic proxy (session + analysis)
    session/           — session CRUD
lib/
  personas/            — JSON persona definitions per mode
  scoring/             — BaselineScore calculation
  vad/                 — VAD helpers
  supabase/            — typed client + server clients
components/
  session/             — live session UI (ThinkingIndicator, WaveformDisplay, etc.)
  trainer/             — Framework Portal components
  ui/                  — shared design system
docs/
  SPEC.md
  MIGRATION_MAP.md
```

## Interview modes

Three modes replace the old "Cozy / Standard / Tough" difficulty presets. Each maps to a persona JSON in `lib/personas/`.

| Mode | File | Purpose |
|---|---|---|
| Distracted | `distracted.json` | Short flat responses, simulated inattention. Forces exec to use hooks and vocal energy. |
| Bridge | `bridge.json` | Trap questions (false premises, yes/no traps). Tests pivot-to-message skill. |
| Standard Press | `standard-press.json` | Professional, balanced inquiry. Baseline mode. |

Personas must mimic the tone, cadence, and pressure of a real professional journalist — not generic Q&A.

## Trainer Framework Portal

The trainer dashboard includes a dedicated portal for injecting firm-specific knowledge into the AI:

- **Coaching Frameworks** — proprietary methodologies (text + structured)
- **Custom Red-Flag Triggers** — words/phrases the firm flags as off-message or problematic
- **Feedback Templates** — the firm's house style for critiquing performance

The AI must reference uploaded frameworks, triggers, and templates during live sessions and in post-session feedback. This is the mechanism that makes critiques "on-brand."

## Pre-Session Focus Modal

Appears immediately before the "Go Live" button. Displays 3–5 concise bullets dynamically chosen from the user's prior session history.

Logic examples:
- Low conciseness score → "Your last session ran long — focus on 30-second soundbites."
- Poor message-hit rate → lead with takeaway-discipline reminder.
- Unused pivot techniques → remind about bridging.

## Scoring

A single unified **Baseline Score (1–100)** is the canonical surfaced number. Sub-scores (clarity, composure, message-hit, bridge success, etc.) are available in a drill-down view.

**Latency threshold is a separate system-health metric** — it is not part of the Baseline Score.

## Conventions

- Commit messages: imperative mood, present tense ("Add STT proxy route", not "Added...").
- API routes return typed response objects — no untyped `Response.json({})`.
- Supabase RLS policies are required on every table.
- Environment variables: prefix with service name (`ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`).
- No `console.log` in production paths — use a structured logger or remove.
