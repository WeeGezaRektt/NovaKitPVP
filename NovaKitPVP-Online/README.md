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
