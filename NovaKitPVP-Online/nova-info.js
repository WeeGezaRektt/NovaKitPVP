(() => {
  const TIERS=[
    ["HT1",60],["LT1",45],["HT2",30],["LT2",20],["HT3",10],
    ["LT3",6],["HT4",4],["LT4",3],["HT5",2],["LT5",1],["Unranked",0]
  ];
  const RANKS=[
    ["Combat GrandMaster","400+ points"],
    ["Combat Master","250+ points"],
    ["Combat Ace","100+ points"],
    ["Combat Specialist","50+ points"],
    ["Combat Cadet","20+ points"],
    ["Combat Novice","10+ points"],
    ["Rookie","0+ points"]
  ];
  const RETIRED=[["RHT1",60],["RLT1",45],["RHT2",30],["RLT2",20]];

  const esc=s=>String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const tierRow=([name,pts])=>`<div class="nova-point-row"><span><span class="tier ${name.toLowerCase()}">${esc(name)}</span><b>${esc(name)}</b></span><strong>${pts} pts</strong></div>`;
  const rankRow=([name,label])=>`<div class="nova-point-row"><span><div><b>${esc(name)}</b><small>Overall rank</small></div></span><strong>${esc(label)}</strong></div>`;

  const btn=document.getElementById("novaInfoBtn");
  const dialog=document.getElementById("novaInfoDialog");
  const close=document.getElementById("closeNovaInfo");
  const body=document.getElementById("novaInfoBody");
  if(!btn||!dialog||!close||!body)return;

  body.innerHTML=`
    <p class="nova-info-intro">NovaKitPVP points come from your strongest achieved tier in each kit. Your current tier, Peak tier, and Retired tier do not stack inside the same kit — only the strongest one counts toward Overall.</p>
    <div class="nova-info-grid">
      <section class="nova-info-section">
        <h3>Tier Points</h3>
        <div class="nova-points-list">${TIERS.map(tierRow).join("")}</div>
      </section>
      <section class="nova-info-section">
        <h3>Overall Ranks</h3>
        <div class="nova-points-list">${RANKS.map(rankRow).join("")}</div>
        <h3 style="margin-top:18px">Retired Tier Points</h3>
        <div class="nova-points-list">${RETIRED.map(tierRow).join("")}</div>
      </section>
    </div>
    <div class="nova-info-note"><b>Example:</b> if you currently have HT2 in Sword but your Peak is HT1, Sword contributes <b>60 points</b> to Overall — not 90. The strongest achieved value is used once per kit.</div>
  `;

  btn.addEventListener("click",()=>dialog.showModal());
  close.addEventListener("click",()=>dialog.close());
  dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&dialog.open)dialog.close()});
})();
