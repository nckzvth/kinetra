# PPL Ramp — Setup

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # progression engine test suite
npm run build    # production build in dist/ (installable PWA)
```

Everything is stored on the device (IndexedDB) and works offline. Cloud sync is optional.

## Cloud sync with Supabase (free tier)

The free plan covers this app easily (500 MB database, 50k monthly users). One catch: **free projects pause after 7 days with no
activity**. Training 3+ times a week keeps it awake, and a paused project can be restored from the dashboard in one click. Your
device copy keeps working while it is paused.

1. Create a free account and a new project at <https://supabase.com/dashboard>.
2. **Create the tables:** open *SQL Editor → New query*, paste all of `supabase/migrations/0001_init.sql`, and click *Run*.
3. **Allow sign-in redirects:** go to *Authentication → URL Configuration*.
   - Set *Site URL* to where you'll use the app (`https://nckzvth.github.io/ppl-ramp/`).
   - Add `http://localhost:5173` under *Redirect URLs* for local use.
4. Sign in with **email + password** (Settings → Cloud sync → Password). Tap *Create account* once, confirm the email from any
   browser, then sign in on each device. This works on the free plan without editing email templates. Custom templates (needed for a
   6-digit code) require custom SMTP or Pro. The *Email link* option also works, but on iPhone the link opens in Safari rather than
   the installed app.
5. Copy the project URL and the **publishable** key (*Project Settings → API Keys*). In the app go to
   *Settings → Cloud sync*, paste both, click *Connect*, then sign in with your email.

Do this on each device. The first sync on a device with no workouts downloads your cloud data instead of overwriting it.

To skip pasting the keys, copy `.env.example` to `.env` and fill it in before `npm run build`. The publishable key is designed to be
public. Row-level security in the migration limits every row to its owner.

## Using it on your phone at the gym

The app is published to GitHub Pages at https://nckzvth.github.io/ppl-ramp/ by `.github/workflows/deploy.yml` on every push to
`main`. Open it on your phone and use *Share → Add to Home Screen* (iPhone) or *Install app* (Android).

In Supabase → *Authentication → URL Configuration*, set *Site URL* to `https://nckzvth.github.io/ppl-ramp/` so confirmation
emails link back to the app.
