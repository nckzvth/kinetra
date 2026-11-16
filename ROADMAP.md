# Kinetra roadmap

Status as of November 2026. Live app: https://nckzvth.github.io/kinetra/

## Done

- **Lifting engine:** gated phases, linear and rep-range progression, automatic deloads, warm-up ramp and feeler sets, plate calculator, rest timer.
- **Editable programs:** templates (PPL ramp-up, full-body, upper/lower), build your own, or just track. Custom exercises, lb/kg.
- **Log activity:** distance and pace, round and bell timer, climbing, timed holds, bodyweight reps.
- **Accounts and sync:** Supabase with email/password and Google sign-in, offline-first on each device.
- **Hosting:** GitHub Pages, deployed on every push to `main`.

## Next: Friends

The social layer that makes people come back daily. The **Feed** tab already exists (your own activity, resume and up-next cards); friends' activity slots into it.

- **Adding friends:** share an invite link or search by username, then accept the request. Nothing is shared until both sides agree.
- **Working out now:** a live "Nick is training · Push A · 18 min" line at the top of Feed, using Supabase's live updates.
- **Feed:** each friend's finished workouts (e.g. "Nick finished Pull A · Deadlift 125 lb · new best"), plus runs, rounds and climbs.
- **Encouragement:**
  - one-tap fist-bump on a workout or while someone is training;
  - short notes;
  - GIFs, which need a free GIF service key (Giphy, for example).
- **High scores:** weekly leaderboards for sessions, total volume, streaks and personal records.
- **Notifications:** push alerts when someone taps you. On iPhone these only work once the app is added to the home screen, and they need a small server-side piece in Supabase.
- **Privacy:** you choose what friends can see (workouts only, or weights too) in You → Friends. Friends only ever see a summary of each workout, never your full data.

## Then: Teams and seasons

Friends grouped into teams that compete. Built on top of Friends.

- **Teams:** start one, invite friends, pick a name, colour and emblem.
- **Seasons:** team against team over a week or month, scored on workouts completed, consistency and personal records, not just raw weight, so beginners can help their team too.
- **Workplace challenges:** a company runs a season with departments as teams. A route to a paid offering for employee-wellness programs.
- **Gaming groups:** friend groups motivating each other with a game-like feel: banners, standings, season results.

## Nutrition

The database tables and sync are already in place.

- Macro bar on Today, daily food log, higher targets on training days.
- Recipe builder that splits a batch into servings and counts down the containers left in the fridge.
- Food search through the USDA database (free API key) and barcode lookup through OpenFoodFacts.
- Plant-based and custom exclusion filters.

## Polish and scale

- Analytics: weekly volume, sets per muscle, strength curves, training compared with nutrition.
- Quick-log command bar (Cmd+K) and reminders.
- CSV export, an accessibility pass, automated tests for sync.
- Desktop layout from tablet widths (currently 900 px and up).
- Branding: trademark check for "Kinetra", custom domain, and a Supabase custom domain so Google's sign-in screen shows Kinetra instead of the project address.
