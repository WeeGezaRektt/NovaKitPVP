NovaKitPVP V17 hotfix

Fixes the 404 when clicking Edit Username.

What changed:
- Edit Username no longer depends on /api/update-staff-username.
- It now uses a secure owner-only Supabase RPC directly.
- Existing staff display names are loaded from staff_profiles.
- Old staff members can be given a username even if they never had one before.
- Email remains underneath for account identification.

The owner_set_staff_username RPC is already installed in the live Supabase database.
