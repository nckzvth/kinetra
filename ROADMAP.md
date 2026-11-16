# Kinetra roadmap

Status as of November 2026. Live app: https://nckzvth.github.io/kinetra/

## Done

- **Lifting engine:** gated phases, linear and rep-range progression, automatic deloads, warm-up ramp and feeler sets, plate calculator, rest timer.
- **Editable programs:** templates (PPL ramp-up, full-body, upper/lower), build your own, or just track. Custom exercises, lb/kg.
- **Log activity:** distance and pace, round and bell timer, climbing, timed holds, bodyweight reps.
- **Accounts and sync:** Supabase with email/password and Google sign-in, offline-first on each device.
- **Hosting:** GitHub Pages, deployed on every push to `main`.

## Friends (built)

- **Profiles:** @username, name, photo and a short bio, with privacy switches for sharing workouts and showing weights (You → Friends). Tap anyone in Feed, Friends or the leaderboard to open their profile page: bio, this week / last 30 days / week streak, and their posts and workouts. Strangers see only name and username.
- **Posts:** "What's up?" status posts with text (up to 500 characters), a photo or a GIF. Friends-only, they stay up until deleted, and get the same reactions, notes and push notifications as workouts. Photos are resized to 1600 px and stripped of location data, then stored in a private bucket that only friends can read.
- **Adding friends:** search by name or @username, or share an invite link (`?invite=username`). Requests are accepted or declined; nothing is shared until both agree.
- **Training now:** a live strip at the top of Feed; cheer friends on with any emoji.
- **Feed:** friends' finished workouts and activities alongside yours, with highlights and (if shared) weights.
- **Encouragement:** reactions with any emoji (grouped like tapbacks) and short private notes, with a "For you" section for what you've received.
- **Notifications:** web push for reactions, notes and friend requests (iPhone: home-screen app on iOS 16.4+).
- **Safety:** block (stops requests and reactions both ways) and report (with optional block); reports land in the `reports` table.
- **This week:** a leaderboard among friends (10 points per session, 1 per 6 active minutes up to 100, 5 per weight increase; resets Monday).
- **Privacy:** enforced by row-level security; verified that strangers see nothing and that nothing is visible before a request is accepted.

### Still to do for Friends

- ~~**GIFs in notes**~~ — built: GIPHY search (key kept server-side), picker with attribution, GIFs in notes and "For you".
- **Reels (later):** short, temporary vertical clips (about 15–30 seconds) that disappear after 24 hours, shown as a row of rings at the top of Feed, tap through full screen, with emoji replies. Needs video upload limits, compression and a cleanup job for expired clips; storage cost is the main thing to plan for on the free tier.

## Then: Teams and seasons

Friends grouped into teams that compete. Builds on the Friends release.

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
