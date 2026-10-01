NovaKitPVP V20.5 — Reliable Old Username Editor

This fixes the exact issue where already-made accounts did not show Edit Username.

Why it happened:
- v16 depended on /api/list-staff before adding the Edit Username button.
- The live list-staff.js was still the old Admin-only version.
- It also hardcoded only two Owner emails and did not know about Tester accounts.

V20.5 changes:
- Edit Username is added to every existing staff card immediately, even if list-staff fails.
- Clicking Edit Username uses the old popup/prompt system you wanted.
- Existing username is pre-filled when available.
- Saving still calls owner_set_staff_username.
- list-staff now recognizes all Owner/Admin/Tester accounts.
- Aaron's Owner account is recognized through the owner_emails database table, not a hardcoded list.
- Tester accounts and linked-player names are returned correctly.
- create-admin/delete/reset-password are also updated to the same current role system.

UPLOAD/REPLACE THESE FILES:
NovaKitPVP-Online/v16-admin.js
NovaKitPVP-Online/api/list-staff.js
NovaKitPVP-Online/api/create-admin.js
NovaKitPVP-Online/api/delete-staff.js
NovaKitPVP-Online/api/reset-staff-password.js

No admin.html change is needed.
No Supabase change is needed for this patch.
