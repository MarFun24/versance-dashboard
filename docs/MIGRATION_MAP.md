# Migration Map — Electron Handoff → Media Trainer (Next.js)

## Source

**Path (read-only, do not edit):** `C:\Users\marka\OneDrive\Documents\Podcast_Trainer_Handoff`

This is a completed Electron desktop prototype of the same core product. Treat it as a reference artefact only — mine the logic, never modify the files.

---

## What is worth porting

### HIGH VALUE — port directly

| Artefact | What to do |
|---|---|
| Persona system-prompt text | Review existing journalist personas and adapt for the three new modes (Distracted, Bridge, Standard Press). The prompt engineering for journalist realism is the hardest part to get right from scratch. |
| Scoring algorithm logic | The sub-score calculation logic (conciseness, filler-word detection, message-hit heuristics) can be translated from Electron JS → TypeScript and dropped into `lib/scoring/`. |
| Red-flag keyword lists | Any default trigger-word lists can seed the trainer's Framework Portal defaults. |
| Session transcript schema | The structure of turn-by-turn transcript objects is a useful reference for the Supabase `session_turns` table schema. |
| VAD integration patterns | If the Electron app used a VAD library, note the parameters (silence threshold, min speech duration, etc.) — these are hard to tune and good defaults save time. |
| UI copy / feedback language | Any example feedback strings, score descriptions, or coaching language can inform the default feedback template. |

### MEDIUM VALUE — inspect, adapt carefully

| Artefact | Notes |
|---|---|
| Prompt templates | The original prompts were likely for Electron's local LLM or an early API version. Adapt for claude-sonnet-4-6 with the new Expert-in-the-Loop injection structure. |
| Audio pipeline code | Electron can use native audio APIs. Web Audio API + vad-web is different. Use as conceptual reference only; do not copy code. |
| Scoring weights | The sub-score weighting may reflect early guesses. Keep as defaults but make them configurable. |

### LOW VALUE — do not port

| Artefact | Reason |
|---|---|
| Electron shell / main process code | Irrelevant to Next.js. |
| Any Electron-specific IPC | Irrelevant. |
| Local file storage patterns | Supabase replaces all local persistence. |
| Any hardcoded user/org data | Start fresh; don't import test data. |
| UI component code | Electron UI (likely React but desktop-sized) won't map cleanly to the web app. Redesign from scratch with the existing design tokens. |

---

## Migration checklist

- [ ] Read persona prompt files from handoff; extract journalist realism techniques
- [ ] Read scoring logic; translate to `lib/scoring/baseline-score.ts`
- [ ] Extract default red-flag keyword list; add to seed data for Framework Portal
- [ ] Document VAD parameters found in handoff; use as defaults in `lib/vad/`
- [ ] Extract transcript schema; inform `session_turns` Supabase table design
- [ ] Note any ElevenLabs voice IDs used; carry forward as defaults
- [ ] Review feedback copy; adapt for default feedback template

---

## Decisions needed before migration

1. **Which Anthropic model string?** Default assumption is `claude-sonnet-4-6` for live sessions and `claude-opus-4-7` for post-session deep analysis. Confirm.
2. **Which ElevenLabs voice ID(s)?** The Electron handoff may have a preferred voice. If not, pick defaults before M1 persona wiring.
3. **Supabase project name / region?** Needed before schema migration. Prefer a region close to the primary user base (US East assumed).
