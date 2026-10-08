NovaKitPVP Temporary Tournament Brackets

Backend already created in Supabase:
- tournament_brackets table
- public read access
- OWNER-ONLY write protection via RLS + set_tournament_bracket RPC
- all 10 kit rows pre-created
- tournament updates appear in the audit log

Frontend files in this patch:
- tournament.html (new)
- tournament.css (new)
- tournament.js (new)
- index.html (adds Tournament button)
- admin.html (adds Tournament button for staff/owners too)
- vercel.json (adds /tournament route)

Tournament features:
- DOUBLE ELIMINATION for every kit
- First loss automatically drops the player into the Losers Bracket
- Second loss eliminates them
- Grand Final + automatic Bracket Reset if the Losers Bracket champion wins the first Grand Final
- Separate bracket for all 10 kits
- Owner can choose 4 / 8 / 16 / 32 player bracket size
- Owner can add existing tierlist players
- Owner can move seeds up/down and remove players
- Owner can advance match winners through every round
- Public users, Admins and Testers are read-only
- Owner permission is enforced server-side, not only in the UI
- Live updates via Supabase realtime
- Mobile-friendly horizontal bracket scrolling

Temporary removal later is simple: remove the Tournament links/page files and drop tournament_brackets + set_tournament_bracket.

Update note: this version keeps using the existing `winners` JSON field, so no tournament database schema change is required. Old single-elimination winner keys are read as Winners Bracket results for compatibility.

V3 TOP 8:
- Each kit now has a live Final Standings panel.
- Shows 1st (Champion), 2nd, 3rd, 4th, 5th, 6th, 7th and 8th.
- 1st/2nd come from the Grand Final / Bracket Reset.
- 3rd onward are calculated from Losers Bracket elimination order.
- If two players are eliminated in the same Losers round, original seed breaks the tie so every place is unique.
- Standings are read-only for public/Admin/Tester just like the bracket.
