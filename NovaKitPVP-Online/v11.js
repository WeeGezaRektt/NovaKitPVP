(() => {
  // V11 previously forced 10 fixed slots + empty "–" tokens and
  // reset ordering back to gamemode order. That fights the
  // MCTiers-style display (active left, retired right, only real tiers).
  //
  // This version intentionally does nothing so app.js can control
  // the tier badges correctly.
})();
