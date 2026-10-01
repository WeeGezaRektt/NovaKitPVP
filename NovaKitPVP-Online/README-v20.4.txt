NovaKitPVP V20.4 — Restore Old Username Editor

This restores the old Staff Username system:

- Existing staff cards show an "Edit Username" button.
- Clicking it opens the old popup/prompt.
- Enter the IGN and press OK.
- It saves through the existing owner_set_staff_username Supabase function.
- Works with Admin and Tester accounts.
- Tester linking still works.
- Bedrock dot usernames are supported.

UPLOAD:
Replace only:
  NovaKitPVP-Online/v16-admin.js

OPTIONAL CLEANUP:
If you added v20.3.css, you can leave it there. It will not break anything.
You can also remove the v20.3.css <link> from admin.html if you want, but it is not required.
