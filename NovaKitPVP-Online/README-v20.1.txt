NovaKitPVP V20.1 — Staff page spam fix

CAUSE:
V20 renamed the Staff Username input from #newAdminUsername to #newStaffUsername.
The older V15 script only checked whether #newAdminUsername existed.
It therefore kept thinking the field was missing and repeatedly created more Staff Username inputs.

FIX:
V15 now treats BOTH IDs as the same existing field, so only one Staff Username input is ever created.
V20 can still rename it to #newStaffUsername for the Admin/Tester account-type system.

UPLOAD:
Replace only:
  NovaKitPVP-Online/v15-admin.js

Nothing else needs changing for this hotfix.
