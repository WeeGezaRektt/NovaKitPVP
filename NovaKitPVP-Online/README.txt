NovaKitPVP V21.3 Update (important fix)
=======================================

Problem found:
v11.js was forcing every player to always show 10 slots and
filling empty ones with "–". It also reset the order, which
broke active-left / retired-right sorting.

This update:
- Disables the old v11.js behaviour
- Keeps denser layout + colored badges (v21.css)
- Keeps correct MCTiers logic in app.js:
  • Active tiers on the LEFT
  • Retired tiers on the RIGHT
  • Best → worst within each group
  • Only real tiers are shown (no empty circles)

Files to upload:
- v11.js       ← important (stops the empty slots)
- v21.css
- index.html
- app.js

How to install:
1. Download & unzip
2. Go to GitHub → NovaKitPVP-Online
3. Drag all 4 files in
4. Commit / Save
5. Wait for Vercel, then hard-refresh the site (Ctrl+Shift+R)
