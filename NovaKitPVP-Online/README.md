# NovaKitPVP Online

Public Minecraft PvP rankings + email-based staff administration, deployed with Vercel and Supabase.

## Staff roles

- **Owner** is granted only when the signed-in email is exactly one of the two Owner emails configured in `public.owner_emails`.
- **Admin** accounts are created by an Owner from the Staff Accounts tab and stored in `public.admin_emails`.
- Admins can edit player details/tiers and delete an individual player.
- Admins cannot access audit logs, clear logs, change passwords, manage staff, change site icons, reset every tier, or factory-reset the tierlist.
- Owners can access all of those controls.
- Minecraft `/tierlink` linking is retired.

## Custom icons

Owners get an **Appearance** tab. Every kit icon, the top-left NovaKitPVP logo icon, and every combat-rank icon can be changed. Each value accepts either an emoji/symbol or an `https://` image URL.

## Java player heads

When a player is saved, the website tries to resolve the Java username through Mojang and stores the UUID. Java heads use Crafatar when a UUID exists, with `mc-heads.net` and Minotar fallbacks. A custom avatar URL can still override this for Bedrock/custom players.

## Vercel environment variables

Production requires:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — required for Owner staff-account creation/removal and password resets

`MINECRAFT_LINK_SECRET` is no longer needed.

## Supabase

Run `supabase/schema.sql` on a fresh project. The live project has already had the email-role and icon migrations applied.


## V4 uploadable icon update

Owners can now upload real icon files directly from the Appearance tab.

Supported formats:
- PNG
- SVG
- WEBP
- JPG / JPEG

Notes:
- Uploaded icons are stored directly as image data in the `site_assets` table, so no separate image host is required.
- Keep icon files under roughly 600 KB each.
- Recommended sizes: 64x64 or 128x128 for kit/rank icons, 128x128 or 256x256 for the main brand logo.
- After selecting a file, click **Save Icons** to publish it site-wide.


## V5 leaderboard/profile update
- Overall tier column now shows each gamemode's uploaded kit icon instead of a text-only tier badge.
- Hovering a kit icon shows the gamemode, tier/rank and its point value.
- Player profiles now show the point value of Active, Peak and Retired tiers per gamemode, plus the points currently counted toward Overall.
- Retired-only tier entries are hidden from individual gamemode pages and remain visible through Overall/player profile history.
