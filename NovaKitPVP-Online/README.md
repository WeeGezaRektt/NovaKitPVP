# NovaKitPVP Online

A Vercel + Supabase version of the NovaKitPVP Minecraft tierlist.

## Included

- Public Overall leaderboard plus Sword, Mace, Vanilla, SpearMace, DiaSMP, NethPot, DiaPot, Cart, UHC and NethSMP pages.
- HT1 -> LT5 point system.
- Active, peak and retired tier history.
- Public Minecraft-head player profiles.
- Real online Supabase database with Row Level Security.
- Staff website login.
- Minecraft account verification using one-time `/tierlink` codes.
- `WeeGezaRektt` and `PoppyMacedU` automatically become Owners only after the Minecraft server verifies the account.
- All other Minecraft-verified staff become Tier Staff and can change tiers only.
- Owner-only player/profile editing, staff password reset, audit logs, Reset All Tiers and Factory Reset.
- Realtime public leaderboard refreshes.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` once in the SQL editor.
3. In Authentication settings, choose whether email confirmation is required. For easiest staff setup, email/password auth can be used normally.
4. Copy the project URL, anon key and service-role key.

## Vercel environment variables

Set these for Production, Preview and Development:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MINECRAFT_LINK_SECRET` (use a long random value and keep it private)

The service-role key and Minecraft link secret are used only inside `/api/*` serverless functions and are never sent to the browser.

## Minecraft linking

The website generates a code such as `NOVA-A1B2C3`. A Paper plugin on the NovaKitPVP server should expose `/tierlink <code>` only to real staff (for example permission `novakitpvp.staff`). The plugin sends this HTTPS request:

`POST https://YOUR-SITE.vercel.app/api/verify-link`

Headers:

- `Content-Type: application/json`
- `x-nova-link-secret: <same MINECRAFT_LINK_SECRET>`

Body:

```json
{
  "code": "NOVA-A1B2C3",
  "uuid": "the players Java UUID without dashes",
  "username": "WeeGezaRektt"
}
```

The API verifies the one-time code, marks the web account as linked and assigns role `owner` only for `WeeGezaRektt` or `PoppyMacedU`; other verified staff receive `tier_staff`.

## Point rules

- HT1 60
- LT1 45
- HT2 30
- LT2 20
- HT3 10
- LT3 6
- HT4 4
- LT4 3
- HT5 2
- LT5 1
- Unranked 0

Retired: RHT1 60, RLT1 45, RHT2 30, RLT2 20.

Each gamemode contributes once to Overall: active tier first; if unranked, retired tier; if neither, peak tier.
