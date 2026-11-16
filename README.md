# PPL Ramp

A training, multi-activity and nutrition app built around a gated Metallicadpa PPL ramp-up. It's an installable web app (PWA) that
works offline, with optional Supabase sync. See [SETUP.md](SETUP.md) to run it and to connect sync.

## Status

| Release | Scope | State |
| --- | --- | --- |
| 1 | Lifting engine, gated phases 1–4, tap-to-log workouts, warmup ramp + feeler sets, plate calculator, rest timer, history, e1RM progress, first-run setup, Supabase sync, hosted PWA | **Built** · live at https://ppl-ramp.netlify.app |
| 2 | Log Activity: distance/pace (stopwatch + laps or manual), rounds & bell timer, climbing (V / YDS), timed holds, bodyweight reps | **Built** |
| 3 | Nutrition: macro ledger, training-day scaling, recipe batches, fridge servings, food search | Schema and sync ready; UI next |
| 4 | Analytics, Cmd+K quick log, kg support, CSV export, accessibility pass, sync tests | Planned |

Supabase project: `ppl-ramp` (`blcznhzmiamnpmxrboue`, us-east-1). Netlify site: `ppl-ramp`.

## Layout

```
src/
  domain/      types (all archetypes + nutrition), exercise catalog, program phases, Day-0 seed
  engine/      pure logic: plan builder, progression/deload/gates, warmups, plates, schedule, e1RM  (+ tests)
  data/        Dexie (IndexedDB) store, workout actions, Supabase sync
  ui/          screens and components
supabase/migrations/   Postgres schema with row-level security
```

The engine has no UI or storage dependencies, so the rules live in one place and are covered by `src/engine/engine.test.ts`.

## How the spec's open questions were settled

1. **Warmups:** start with the empty bar, then try roughly 55% / 75% / 88% of the working weight. A ramp set is kept only if it is
   at least 10 lb above the previous one and at least 10 lb below the working weight. Reps go 5, then 3, then 1–2.
2. **Gate:** a session counts only if every exercise hits its minimum reps. A miss pauses the counter and never resets it.
   Only main lifts can trigger the 10% deload.
3. **Phase 3:** a one-tap joint-pain check at finish. A "yes" means the session doesn't count toward the gate.
4. **Push A secondary press:** stays the seeded dumbbell OHP in every phase. Barbell OHP is listed as a substitute.
5. **Increments:** dumbbell steps come from Settings (2.5 or 5 lb). Leg Press uses 10 lb.
6. **Shared lifts:** they progress on every exposure. Squat moves on both Legs A and Legs B. Lateral raises in both Phase 4
   supersets are judged together.
7. **Schedule:** the rotation pointer decides what's next. Dates are suggestions, so a missed day shifts the queue.
8. **Rep windows:** when a range widens between phases (e.g. 8–10 to 8–12), the weight carries over.
