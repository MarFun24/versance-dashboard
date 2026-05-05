# Media Trainer — Product Spec

## Overview

Media Trainer is a white-label AI platform that lets PR firms train executive clients for live press interviews. An AI journalist persona conducts a simulated press session; real-time and post-session analytics give actionable coaching feedback calibrated to the firm's proprietary methodology.

**Core design principle:** Expert-in-the-Loop. The trainer's coaching frameworks, red-flag vocabulary, and feedback house style are injected into the AI so every critique is "on-brand" for the firm — not generic.

---

## User roles

| Role | Description |
|---|---|
| **Org Admin** | Licenses the platform for the firm; manages trainers and white-label config |
| **Trainer** | Configures the AI (Framework Portal); creates trainee accounts; reviews session history |
| **Trainee** | Runs sessions; views personal history and scores |

---

## Feature set — MVP

### 1. Authentication & Multi-Tenancy

- Supabase Auth (email/password + magic link)
- 3-tier data model: Organization → Trainer → Trainee
- Row-Level Security on all tables; every query scoped to org
- White-label config per org: logo, brand colors, custom subdomain/domain

### 2. Trainer Framework Portal *(Expert-in-the-Loop)*

A dedicated UI inside the trainer dashboard. Trainers input:

- **Coaching Frameworks** — proprietary methodologies in free text + structured fields (e.g., "Bridge technique: acknowledge → bridge → message")
- **Custom Red-Flag Triggers** — words/phrases the firm flags. These are monitored in real-time during sessions, not just post-session (affects implementation: requires streaming token inspection).
- **Feedback Templates** — house style for critiques (tone, structure, example phrases)

**Knowledge Injection:** The AI (session LLM and post-session analysis LLM) must load these entries at session start and reference them throughout. Framework entries are embedded and retrieved via semantic similarity if the corpus grows large; for MVP a full-context injection is acceptable up to token limits.

### 3. Interview Modes

Three modes replace the legacy "Cozy / Standard / Tough" difficulty presets. Each mode maps to a persona JSON in `lib/personas/`. Personas must simulate the tone, cadence, and pressure of a real professional journalist.

#### Distracted Mode (`lib/personas/distracted.json`)
The AI gives short, flat responses ("Right," "Go on," "Sure") and simulates inattention (deliberate pauses, no validation, occasional silence). **Goal:** Forces the exec to use hooks, restatements, and vocal energy to re-engage a disinterested interviewer.

#### Bridge Mode (`lib/personas/bridge.json`)
The AI asks Trap Questions: false premises, yes/no traps, leading assumptions. **Goal:** Tests and grades the user's ability to acknowledge the question, sidestep the trap, and bridge back to their key message. Closely tied to Bridge Scoring (gravy).

#### Standard Press Mode (`lib/personas/standard-press.json`)
Professional, balanced inquiry — a skilled but fair journalist. **Goal:** Baseline practice mode; establishes a clean performance benchmark.

### 4. Live Session Engine

The real-time pipeline:

```
Browser mic → VAD (vad-web) → PCM chunk
  → /api/stt (OpenAI Whisper) → transcript
  → /api/llm (Anthropic, streaming) → token stream
  → /api/tts (ElevenLabs, sentence streaming) → audio playback
```

**Latency constraint (hard, non-negotiable):** End-to-end from user-stops-talking → AI-starts-speaking ≤ 800 ms. Target 500–700 ms.

Implementation requirements:
- TTS must begin on the first complete sentence from the LLM stream, not after the full response.
- LLM stream must be split on sentence boundaries and piped to TTS incrementally.
- STT should be edge-proxied (Vercel Edge Function) to minimize geographic round-trip.
- Render a "Thinking..." indicator immediately when VAD fires end-of-speech so the user knows not to speak.

**Scenario Realism directive:** Persona system prompts must simulate journalist pressure, not generic helpfulness. The AI does not congratulate the user, does not soften follow-ups, and does not break character.

**Knowledge Injection at runtime:** At session start, load the trainer's active framework entries, red-flag triggers, and feedback template into the system prompt. The AI must reference these when generating follow-up questions and real-time coaching nudges.

**Real-time Red-Flag Detection:** During the session, monitor the transcript stream for trainer-defined red-flag trigger words/phrases. Surface an in-session indicator (e.g., subtle highlight or sidebar flag) immediately — not post-session.

### 5. Pre-Session Focus Modal

Displayed immediately before the "Go Live" button on the session start screen. Shows 3–5 concise bullets dynamically selected from the user's prior session history.

Selection logic (priority order):
1. Lowest sub-score dimension from the most recent session.
2. Any red-flag triggers that fired more than once across the last 3 sessions.
3. Lowest trending sub-score (regressing over the last 3 sessions).
4. Generic best-practice prompt if no history exists.

Example bullets:
- "Your last session ran long — aim for 30-second soundbites today."
- "You used filler phrases 4 times last session — watch for 'um' and 'you know'."
- "Message hit-rate was 40% — lead every answer back to your three key points."

### 6. Post-Session Analysis & Scoring

Triggered automatically when the session ends.

**Baseline Score (1–100):** The single canonical number surfaced to the trainee. Combines all sub-analytics with weighted components (weights configurable by trainer in future; hardcoded for MVP).

Sub-scores (drill-down only):
- Conciseness (average response length vs. 30-second target)
- Message Hit Rate (% of answers that landed a key message)
- Composure (filler word count, pace variance)
- Bridge Success Rate (Bridge Mode only: % of trap questions handled correctly)

**Latency (system-health metric, not part of score):** Measured per turn. Surfaced in the trainer dashboard as a health indicator. Alert threshold: > 800 ms on > 20% of turns.

Feedback report:
- Narrative summary calibrated to the trainer's uploaded Feedback Template
- Per-turn highlights (what worked, what to improve)
- Red-flag instances with timestamps
- Trend line if prior sessions exist

### 7. Session History

Trainees: personal history, score trend, replay (audio + transcript).
Trainers: all trainees' history, aggregate performance across cohort.

---

## System health metrics

| Metric | Threshold | Where surfaced |
|---|---|---|
| E2E latency (p50) | ≤ 600 ms | Trainer dashboard + internal monitoring |
| E2E latency (p95) | ≤ 800 ms | Alert if exceeded on > 20% of turns |
| STT error rate | < 2% | Internal |
| TTS stream start time | ≤ 400 ms from first sentence | Internal |

---

## Gravy list (post-MVP, priority order)

Exactly 6 features. Nothing else.

1. **Inflection & Tone** — pitch variance and energy-level analysis from raw audio (beyond text analysis). Requires audio ML pipeline.

2. **Bridge Scoring** — dedicated tracking of trap-question redirect success rate over time; trend charts; trainer visibility into which trap types trip the trainee most.

3. **Storytelling Signal** — detect use of imagery, anecdotes, and narrative vs. dry data recitation. Flags when the exec "goes corporate."

4. **Red-Flag Detection (real-time upgrade)** — MVP has real-time flagging; this gravy item adds a second-pass during post-session analysis with richer context, pattern matching across sessions, and trainer-configurable severity levels.

5. **Researcher Mode** — AI ingests a specific journalist's published work, interview style, and beat to simulate that journalist's questions and pressure style. Trainer provides journalist background before the session.

6. **Gamified Coaching** — post-session XP, progress bars, achievement badges, "leveling up" on specific skills. Trainee-facing motivation layer.

---

## Non-features (explicitly out of scope)

- Any sixth vendor beyond Vercel, Supabase, Anthropic, OpenAI, ElevenLabs.
- Client-side API keys.
- Video recording or video analysis (audio only for MVP).
- Public marketplace or self-serve signup (B2B sales-driven; org accounts provisioned manually for MVP).
