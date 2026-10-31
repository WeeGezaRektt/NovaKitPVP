NovaKitPVP V21.1 Update
=======================

What this does:
- Makes the overall leaderboard denser (less zoomed out)
- Adds proper colored tier badges like mctiers
- Fully supports retired tiers with dashed rings + muted look
- Updated display logic to follow MCTiers rule:
  → If a player is retired in a kit, show their peak tier (or retired value)

Files included:
- v21.css          → new denser layout + colored badges (including retired)
- index.html       → loads the new CSS
- app.js           → updated shownTier logic (MCTiers-style)

How to install (your usual method):
1. Download and unzip this folder
2. Go to your GitHub repo → NovaKitPVP-Online folder
3. Drag these 3 files into the GitHub upload:
   - v21.css
   - index.html
   - app.js
4. Commit / Save changes
5. Vercel will automatically redeploy

That's it. After the deploy finishes, refresh the site.
