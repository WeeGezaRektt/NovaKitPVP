(() => {
  const MODES = ["Sword","Mace","Vanilla","SpearMace","DiaSMP","NethPot","DiaPot","Cart","UHC","NethSMP"];

  function makeEmpty(mode) {
    const wrap = document.createElement("span");
    wrap.className = "overall-tier-token untested";
    wrap.dataset.tierTip = `${mode}: Not tested`;
    wrap.setAttribute("aria-label", `${mode}: Not tested`);
    const circle = document.createElement("span");
    circle.className = "overall-kit-circle";
    const dash = document.createElement("b");
    dash.textContent = "–";
    wrap.append(circle, dash);
    return wrap;
  }

  function normalizeTierRow(row) {
    if (!row || row.dataset.v11Normalized === "1") return;
    const existing = [...row.querySelectorAll(":scope > .overall-tier-token")];
    if (!existing.length) {
      row.textContent = "";
      MODES.forEach(mode => row.appendChild(makeEmpty(mode)));
      row.dataset.v11Normalized = "1";
      return;
    }
    const byMode = new Map();
    for (const token of existing) {
      const tip = token.dataset.tierTip || token.getAttribute("aria-label") || "";
      const mode = MODES.find(m => tip.startsWith(`${m}:`));
      if (mode) byMode.set(mode, token);
    }
    if (byMode.size) {
      row.textContent = "";
      MODES.forEach(mode => row.appendChild(byMode.get(mode) || makeEmpty(mode)));
    } else {
      while (row.children.length < MODES.length) row.appendChild(makeEmpty("Not tested"));
    }
    row.dataset.v11Normalized = "1";
  }

  function run() {
    document.querySelectorAll(".ref-tiers").forEach(normalizeTierRow);
  }

  const observer = new MutationObserver(() => {
    document.querySelectorAll(".ref-tiers").forEach(row => {
      if (row.dataset.v11Normalized !== "1") normalizeTierRow(row);
    });
  });

  run();
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
