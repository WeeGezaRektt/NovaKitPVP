NovaKitPVP V20.3 — Existing Staff Username Fix

WHAT WAS WRONG
--------------
The old username editor was still relying on the older V16 prompt/button flow.
After the Tester changes, existing accounts could show up correctly but the username
editor was unreliable / missing for accounts that were created before Tester support.

WHAT THIS FIX DOES
------------------
- Every existing Owner/Admin/Tester card gets a real inline Staff Username box.
- Existing names are pre-filled.
- Accounts with no name show "No username set".
- Click "Save Username" to save it.
- Works for accounts that existed before Tester support.
- Works for Admin and Tester accounts.
- For Testers, the username also links to the matching tierlist player.
- Java/Bedrock dot-style names are supported by the already-fixed Supabase backend.
- Tester self-tier protection remains unchanged.

UPLOAD
------
1. Replace:
   NovaKitPVP-Online/v16-admin.js

2. Add:
   NovaKitPVP-Online/v20.3.css

3. Add this line to admin.html AFTER v20.css:
   <link rel="stylesheet" href="/v20.3.css">

No database change is required for this hotfix; the live Supabase function already
supports existing Admin/Tester accounts.
