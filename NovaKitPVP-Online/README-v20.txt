NovaKitPVP V20 — Tester Accounts

- New Tester role alongside Admin and Owner.
- Testers log in through the same Staff Login.
- Tester range: LT5 -> HT5 -> LT4 -> HT4 -> LT3.
- HT3 and above are Admin/Owner-only.
- Testers cannot edit a kit already above LT3.
- Testers cannot change their own linked player tiers.
- Testers cannot edit profile info, Peak/Retired, delete players, add players, or use Owner tools.
- Restrictions are enforced server-side in Supabase.

Linking:
- A Tester username must match an existing tierlist IGN exactly.
- Creating a Tester links that staff account to the matching player.
- For existing staff: Edit Username to the exact tierlist IGN, then change Role to Tester.

The Supabase migration for tester accounts has already been applied live.

Upload these into NovaKitPVP-Online:
- admin.html
- v20.css
- v20-tester.js
- api/create-admin.js
- api/list-staff.js
- api/delete-staff.js
- api/reset-staff-password.js

Railway / Nova Sync is not needed for this workflow.
