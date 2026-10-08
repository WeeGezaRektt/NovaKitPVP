NovaKitPVP Tournament v5 — Clean / Easy-to-Understand UI

WHAT CHANGED
- No giant sideways bracket.
- No long page containing every Winners + Losers round at once.
- Before the tournament starts, everyone sees one clear Round 1 matchup screen.
- Owners can drag players between opponent slots. On phones, tap player -> tap destination slot.
- Owner controls are one compact bar: bracket size, add player, start tournament.
- Once started, matchup editing locks.
- Public/Staff/Owners all get the same simple live tournament view.
- Four clear buttons: Winners Bracket / Losers Bracket / Finals / Top 8.
- Winners and Losers show ONE round at a time with simple left/right arrows.
- Matches are responsive cards; no horizontal scrolling.
- Owners keep Advance buttons.
- Completed matches are visually locked.
- The v4 atomic/revision backend is still used, preventing old/stale updates from putting players backwards.
- Top 8 remains automatic.

FILES TO REPLACE
- NovaKitPVP-Online/tournament.html
- NovaKitPVP-Online/tournament.js
- NovaKitPVP-Online/tournament.css

No new database migration is required if the v4 stability backend was already applied.
