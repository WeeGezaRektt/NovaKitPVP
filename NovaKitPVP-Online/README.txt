NovaKitPVP V21.2 Update
=======================

What this does:
- Makes the overall leaderboard denser (less zoomed out)
- Adds proper colored tier badges like mctiers
- Fully supports retired tiers with dashed rings + muted look
- Updated display logic to follow MCTiers rules:
  1. If a player is retired in a kit → show their peak / retired tier
  2. Active tiers always appear on the LEFT
  3. Retired tiers appear on the RIGHT
  4. Within each group: best → worst

Files included:
- v21.css          → denser layout + colored badges (including retired)
- index.html       → loads the new CSS
- app.js           → updated shownTier + overallBadges sorting

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
