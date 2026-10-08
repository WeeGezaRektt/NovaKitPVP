import { getSupabase } from './supabase-loader.js';
import { GAMEMODES, DEFAULT_ASSETS, assetValue, iconMarkup, headImg, bindHeadFallbacks, esc } from './site-config.js';

const $=s=>document.querySelector(s);
let supabase;
let players=[];
let playerById=new Map();
let brackets=new Map();
let assets={...DEFAULT_ASSETS};
let currentMode='sword';
let accessRole='public';
let activeView='winners';
let activeWinnerRound=1;
let activeLoserRound=1;
let selectedSetupSlot=null;
let busy=false;

function toast(message){
  const t=$('#toast');
  if(!t)return;
  t.textContent=message;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>t.classList.add('hidden'),2800);
}

function rowsToAssets(rows){
  return {...DEFAULT_ASSETS,...Object.fromEntries((rows||[]).map(r=>[r.asset_key,r.asset_value]))};
}

function isOwner(){return accessRole==='owner'}
function currentKit(){return GAMEMODES.find(g=>g.id===currentMode)||GAMEMODES[0]}
function kitIcon(g){return iconMarkup(assetValue(assets,g.assetKey),'asset-icon')}
function rpcRow(data){return Array.isArray(data)?data[0]:(data||null)}

function normalizeResults(raw){
  const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const out={};
  for(const [key,value] of Object.entries(source)){
    if(/^\d+-\d+$/.test(key))out[`W:${key}`]=value;
    else out[key]=value;
  }
  return out;
}

function blankBracket(gamemode,size=16){
  return {
    gamemode,
    bracket_size:size,
    seeds:Array(size).fill(null),
    winners:{},
    started:false,
    revision:0,
    updated_at:null
  };
}

function normalizeBracket(row){
  const size=[4,8,16,32].includes(Number(row?.bracket_size))?Number(row.bracket_size):16;
  const rawSeeds=Array.isArray(row?.seeds)?row.seeds:[];
  const seeds=Array(size).fill(null).map((_,i)=>rawSeeds[i]||null);
  return {
    ...row,
    bracket_size:size,
    seeds,
    winners:normalizeResults(row?.winners),
    started:Boolean(row?.started)||Object.keys(normalizeResults(row?.winners)).length>0,
    revision:Number(row?.revision||0)
  };
}

function setBracket(row){
  if(!row?.gamemode)return;
  brackets.set(row.gamemode,normalizeBracket(row));
}

function state(){return brackets.get(currentMode)||blankBracket(currentMode)}
function roundCount(size){return Math.log2(size)}
function matchCount(size,roundNo){return size/(2**roundNo)}
function loserRoundCount(size){return Math.max(0,(roundCount(size)*2)-2)}
function loserMatchCount(size,lbRound){return size/(2**(Math.ceil(lbRound/2)+1))}
function wbKey(r,m){return `W:${r}-${m}`}
function lbKey(r,m){return `L:${r}-${m}`}
function wbWinner(s,r,m){return s.winners[wbKey(r,m)]||null}
function lbWinner(s,r,m){return s.winners[lbKey(r,m)]||null}

function wbParticipant(roundNo,matchNo,side,s){
  if(roundNo===1)return s.seeds[(matchNo*2)+side]||null;
  return wbWinner(s,roundNo-1,(matchNo*2)+side);
}

function wbLoser(roundNo,matchNo,s){
  const a=wbParticipant(roundNo,matchNo,0,s);
  const b=wbParticipant(roundNo,matchNo,1,s);
  const winner=wbWinner(s,roundNo,matchNo);
  if(!winner)return null;
  if(String(winner)===String(a))return b||null;
  if(String(winner)===String(b))return a||null;
  return null;
}

function lbParticipant(lbRound,matchNo,side,s){
  const stage=Math.ceil(lbRound/2);
  if(lbRound===1)return wbLoser(1,(matchNo*2)+side,s);
  if(lbRound%2===1)return lbWinner(s,lbRound-1,(matchNo*2)+side);
  if(side===0)return lbWinner(s,lbRound-1,matchNo);
  return wbLoser(stage+1,matchNo,s);
}

function lbLoser(roundNo,matchNo,s){
  const a=lbParticipant(roundNo,matchNo,0,s);
  const b=lbParticipant(roundNo,matchNo,1,s);
  const winner=lbWinner(s,roundNo,matchNo);
  if(!winner)return null;
  if(String(winner)===String(a))return b||null;
  if(String(winner)===String(b))return a||null;
  return null;
}

function seedIndex(s,playerId){
  const idx=s.seeds.findIndex(x=>String(x||'')===String(playerId||''));
  return idx<0?9999:idx;
}

function orderBySeed(s,ids){
  return ids.filter(Boolean).sort((a,b)=>seedIndex(s,a)-seedIndex(s,b));
}

function topEightPlacements(s){
  const places=Array(8).fill(null);
  const wbRounds=roundCount(s.bracket_size);
  const lbRounds=loserRoundCount(s.bracket_size);
  const wbChamp=wbWinner(s,wbRounds,0);
  const lbChamp=lbWinner(s,lbRounds,0);
  const gfWinner=s.winners.GF||null;
  const resetNeeded=Boolean(gfWinner&&lbChamp&&String(gfWinner)===String(lbChamp));
  const rfWinner=s.winners.RF||null;

  if(gfWinner&&wbChamp&&String(gfWinner)===String(wbChamp)){
    places[0]=gfWinner;
    places[1]=lbChamp||null;
  }else if(resetNeeded&&rfWinner){
    places[0]=rfWinner;
    places[1]=String(rfWinner)===String(wbChamp)?lbChamp:wbChamp;
  }

  if(lbRounds>=1)places[2]=lbLoser(lbRounds,0,s);
  if(lbRounds>=2)places[3]=lbLoser(lbRounds-1,0,s);

  if(lbRounds>=3){
    const n=loserMatchCount(s.bracket_size,lbRounds-2);
    const eliminated=orderBySeed(s,Array.from({length:n},(_,m)=>lbLoser(lbRounds-2,m,s)));
    places[4]=eliminated[0]||null;
    places[5]=eliminated[1]||null;
  }

  if(lbRounds>=4){
    const n=loserMatchCount(s.bracket_size,lbRounds-3);
    const eliminated=orderBySeed(s,Array.from({length:n},(_,m)=>lbLoser(lbRounds-3,m,s)));
    places[6]=eliminated[0]||null;
    places[7]=eliminated[1]||null;
  }

  return places;
}

function roundLabel(size,roundNo){
  const matches=matchCount(size,roundNo);
  if(matches===1)return 'Winners Final';
  if(matches===2)return 'Winners Semifinals';
  if(matches===4)return 'Winners Quarterfinals';
  if(matches===8)return 'Winners Round of 16';
  if(matches===16)return 'Winners Round of 32';
  return `Winners Round ${roundNo}`;
}

function loserRoundLabel(size,roundNo){
  const total=loserRoundCount(size);
  if(roundNo===total)return 'Losers Final';
  return `Losers Round ${roundNo}`;
}

function renderNav(){
  $('#tournamentKitNav').innerHTML=GAMEMODES.map(g=>`
    <button class="tournament-kit-btn ${g.id===currentMode?'active':''}" data-tournament-mode="${g.id}">
      <span class="tournament-kit-icon">${kitIcon(g)}</span>
      <span>${esc(g.name)}</span>
    </button>`).join('');

  document.querySelectorAll('[data-tournament-mode]').forEach(btn=>{
    btn.onclick=()=>{
      currentMode=btn.dataset.tournamentMode;
      activeView='winners';
      activeWinnerRound=1;
      activeLoserRound=1;
      selectedSetupSlot=null;
      renderNav();
      renderAll();
    };
  });
}

function renderAccess(){
  const badge=$('#accessBadge');
  if(isOwner()){
    badge.className='tournament-access-badge owner';
    badge.textContent='Owner edit mode';
  }else if(accessRole==='admin'){
    badge.className='tournament-access-badge staff';
    badge.textContent='Staff view · read only';
  }else{
    badge.className='tournament-access-badge public';
    badge.textContent='Public view · read only';
  }
}

function playerMarkup(playerId,size=32){
  const p=playerById.get(String(playerId));
  if(!p)return '<span class="tournament-seed-empty">Unknown player</span>';
  return `${headImg(p,size,p.name)}<strong>${esc(p.name)}</strong>`;
}

function statusText(s){
  if(s.started)return 'Tournament live · matchups locked';
  if(s.seeds.some(Boolean))return 'Setup mode · drag players into matchups';
  return 'Setup mode · add players to begin';
}

async function refreshCurrentBracket(){
  const {data,error}=await supabase
    .from('tournament_brackets')
    .select('gamemode,bracket_size,seeds,winners,started,revision,updated_at')
    .eq('gamemode',currentMode)
    .single();
  if(error)throw error;
  setBracket(data);
  renderAll();
}

async function runOwnerRpc(name,args,successMessage){
  if(!isOwner()||busy)return null;
  busy=true;
  document.body.classList.add('tournament-busy');
  try{
    const {data,error}=await supabase.rpc(name,args);
    if(error)throw error;
    const row=rpcRow(data);
    if(row)setBracket(row);
    renderAll();
    if(successMessage)toast(successMessage);
    return row;
  }catch(e){
    const message=e?.message||String(e);
    toast(message);
    if(/changed somewhere else|revision/i.test(message)){
      try{await refreshCurrentBracket()}catch{}
    }
    return null;
  }finally{
    busy=false;
    document.body.classList.remove('tournament-busy');
  }
}

async function saveSetup(nextSeeds,nextSize=state().bracket_size,message='Matchups saved'){
  const s=state();
  return runOwnerRpc('set_tournament_setup',{
    target_gamemode:currentMode,
    target_size:nextSize,
    target_seeds:nextSeeds,
    target_expected_revision:s.revision
  },message);
}

async function startTournament(){
  const s=state();
  return runOwnerRpc('start_tournament',{
    target_gamemode:currentMode,
    target_expected_revision:s.revision
  },'Tournament started · matchups are now locked');
}

async function resetTournament(){
  const s=state();
  return runOwnerRpc('reset_tournament_results',{
    target_gamemode:currentMode,
    target_expected_revision:s.revision
  },'Results reset · matchup editing unlocked');
}

async function advanceMatch(matchKey,playerId){
  const s=state();
  if(!s.started){toast('Start the tournament first.');return}
  if(s.winners[matchKey]){toast('That match is already locked.');return}
  await runOwnerRpc('advance_tournament_match',{
    target_gamemode:currentMode,
    target_match_key:matchKey,
    target_winner_id:playerId,
    target_expected_revision:s.revision
  },'Winner advanced');
}

function swapSlots(from,to){
  if(from===to){selectedSetupSlot=null;renderOwnerControls();return}
  const s=state();
  if(s.started)return;
  const next=[...s.seeds];
  [next[from],next[to]]=[next[to],next[from]];
  selectedSetupSlot=null;
  saveSetup(next,s.bracket_size,'Matchup moved');
}

function setupSlotMarkup(s,index){
  const pid=s.seeds[index];
  const p=pid?playerById.get(String(pid)):null;
  const selected=selectedSetupSlot===index;
  return `<div class="setup-drop-slot ${p?'filled':'empty'} ${selected?'selected':''}" data-setup-slot="${index}">
    <span class="setup-slot-number">${index+1}</span>
    ${p?`
      <div class="setup-player" draggable="true" data-drag-seed="${index}">
        ${headImg(p,34,p.name)}
        <span><strong>${esc(p.name)}</strong><small>Drag or tap to move</small></span>
      </div>
      <button class="setup-remove" data-remove-setup="${index}" title="Remove ${esc(p.name)}">×</button>`:
      `<span class="setup-empty-text">Drop player here</span>`}
  </div>`;
}

function wireSetupDrag(){
  document.querySelectorAll('[data-drag-seed]').forEach(card=>{
    card.addEventListener('dragstart',e=>{
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',card.dataset.dragSeed);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend',()=>card.classList.remove('dragging'));
  });

  document.querySelectorAll('[data-setup-slot]').forEach(slot=>{
    slot.addEventListener('dragover',e=>{
      e.preventDefault();
      e.dataTransfer.dropEffect='move';
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave',()=>slot.classList.remove('drag-over'));
    slot.addEventListener('drop',e=>{
      e.preventDefault();
      slot.classList.remove('drag-over');
      const from=Number(e.dataTransfer.getData('text/plain'));
      const to=Number(slot.dataset.setupSlot);
      if(Number.isInteger(from)&&Number.isInteger(to))swapSlots(from,to);
    });
    slot.addEventListener('click',e=>{
      if(e.target.closest('[data-remove-setup]'))return;
      const to=Number(slot.dataset.setupSlot);
      const s=state();
      if(selectedSetupSlot===null){
        if(!s.seeds[to])return;
        selectedSetupSlot=to;
        renderOwnerControls();
      }else{
        swapSlots(selectedSetupSlot,to);
      }
    });
  });

  document.querySelectorAll('[data-remove-setup]').forEach(btn=>{
    btn.onclick=e=>{
      e.stopPropagation();
      const i=Number(btn.dataset.removeSetup);
      const s=state();
      const p=playerById.get(String(s.seeds[i]));
      if(!confirm(`Remove ${p?.name||'this player'} from this tournament?`))return;
      const next=[...s.seeds];
      next[i]=null;
      selectedSetupSlot=null;
      saveSetup(next,s.bracket_size,'Player removed');
    };
  });
}

function renderOwnerControls(){
  const panel=$('#ownerControls');
  if(!isOwner()){
    panel.classList.add('hidden');
    panel.innerHTML='';
    return;
  }

  const s=state();
  const used=new Set(s.seeds.filter(Boolean).map(String));
  const available=players.filter(p=>!used.has(String(p.id)));
  const filled=s.seeds.filter(Boolean).length;
  const matches=s.bracket_size/2;

  panel.classList.remove('hidden');
  panel.innerHTML=`
    <div class="owner-control-bar">
      <div class="owner-control-copy">
        <div class="eyebrow">OWNER CONTROLS</div>
        <h3>${s.started?'Tournament is live':'Build Round 1 matchups'}</h3>
        <p>${s.started?'Seeds are locked while results exist. Use Reset Results if you truly need to rebuild matchups.':'Drag players between opponent slots. On phones, tap one player and then tap the slot you want to swap with.'}</p>
      </div>
      <div class="owner-control-actions">
        <label><span>Size</span><select id="bracketSizeSelect" ${s.started?'disabled':''}>${[4,8,16,32].map(n=>`<option value="${n}" ${s.bracket_size===n?'selected':''}>${n}</option>`).join('')}</select></label>
        <label class="owner-add-player"><span>Add player</span><select id="tournamentPlayerSelect" ${(!available.length||s.started)?'disabled':''}>${available.length?available.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''):'<option>No players available</option>'}</select></label>
        <button id="addTournamentPlayer" class="btn small" ${(!available.length||filled>=s.bracket_size||s.started)?'disabled':''}>+ Add</button>
        ${s.started?`<button id="resetTournamentResults" class="btn danger small">Reset Results</button>`:`<button id="startTournament" class="btn primary small" ${filled<2?'disabled':''}>Start Tournament</button>`}
      </div>
    </div>
    <div class="owner-state-line"><span>${statusText(s)}</span><b>${filled}/${s.bracket_size} players</b></div>
    ${s.started?`<div class="matchup-locked-note">🔒 Round 1 matchups are locked while the tournament is live.</div>`:`
      <div class="setup-matchups">
        ${Array.from({length:matches},(_,m)=>`<div class="setup-match-card"><div class="setup-match-title">Match ${m+1}</div>${setupSlotMarkup(s,m*2)}<div class="setup-vs">VS</div>${setupSlotMarkup(s,m*2+1)}</div>`).join('')}
      </div>`}`;

  const sizeSelect=$('#bracketSizeSelect');
  if(sizeSelect)sizeSelect.onchange=async()=>{
    const nextSize=Number(sizeSelect.value);
    if(nextSize===s.bracket_size)return;
    if(nextSize<s.bracket_size&&s.seeds.slice(nextSize).some(Boolean)){
      if(!confirm(`Changing to ${nextSize} slots removes players after slot ${nextSize}. Continue?`)){
        sizeSelect.value=String(s.bracket_size);
        return;
      }
    }
    const next=s.seeds.slice(0,nextSize);
    while(next.length<nextSize)next.push(null);
    selectedSetupSlot=null;
    await saveSetup(next,nextSize,'Bracket size updated');
  };

  const add=$('#addTournamentPlayer');
  if(add)add.onclick=async()=>{
    const pid=$('#tournamentPlayerSelect')?.value;
    if(!pid)return;
    const i=s.seeds.findIndex(x=>!x);
    if(i<0){toast('This bracket is full.');return}
    const next=[...s.seeds];
    next[i]=pid;
    await saveSetup(next,s.bracket_size,'Player added');
  };

  const start=$('#startTournament');
  if(start)start.onclick=()=>{
    if(!confirm(`Lock these ${currentKit().name} matchups and start the tournament?`))return;
    startTournament();
  };

  const reset=$('#resetTournamentResults');
  if(reset)reset.onclick=()=>{
    if(!confirm(`Reset every ${currentKit().name} result and unlock matchup editing? Seeds stay in place.`))return;
    resetTournament();
  };

  if(!s.started)wireSetupDrag();
  bindHeadFallbacks(panel);
}

function viewTabsMarkup(){
  const tabs=[['winners','Winners'],['losers','Losers'],['finals','Finals'],['top8','Top 8']];
  return `<div class="bracket-view-tabs">${tabs.map(([id,label])=>`<button class="bracket-view-tab ${activeView===id?'active':''}" data-bracket-view="${id}">${label}</button>`).join('')}</div>`;
}

function roundTabsMarkup(kind,s){
  const count=kind==='winners'?roundCount(s.bracket_size):loserRoundCount(s.bracket_size);
  const active=kind==='winners'?activeWinnerRound:activeLoserRound;
  return `<div class="round-picker">${Array.from({length:count},(_,i)=>{
    const r=i+1;
    const label=kind==='winners'?roundLabel(s.bracket_size,r):loserRoundLabel(s.bracket_size,r);
    return `<button class="round-pill ${active===r?'active':''}" data-round-kind="${kind}" data-round="${r}">${esc(label)}</button>`;
  }).join('')}</div>`;
}

function matchSlotMarkup(playerId,winnerId,matchKey,s){
  if(!playerId)return `<div class="focus-slot empty"><span>TBD</span></div>`;
  const p=playerById.get(String(playerId));
  if(!p)return `<div class="focus-slot empty"><span>Unavailable player</span></div>`;
  const selected=String(winnerId||'')===String(playerId);
  const locked=Boolean(winnerId);
  return `<div class="focus-slot ${selected?'winner':locked?'lost':''}">
    ${headImg(p,36,p.name)}
    <div class="focus-player-name"><strong>${esc(p.name)}</strong>${selected?'<small>Advanced</small>':locked?'<small>Eliminated from this match</small>':''}</div>
    ${isOwner()&&s.started&&!locked?`<button class="tournament-advance" data-advance-key="${matchKey}" data-advance-player="${p.id}">Advance</button>`:''}
    ${selected?'<span class="winner-check">✓</span>':''}
  </div>`;
}

function renderRound(kind,s){
  const max=kind==='winners'?roundCount(s.bracket_size):loserRoundCount(s.bracket_size);
  if(kind==='winners')activeWinnerRound=Math.min(Math.max(1,activeWinnerRound),max);
  else activeLoserRound=Math.min(Math.max(1,activeLoserRound),max);
  const r=kind==='winners'?activeWinnerRound:activeLoserRound;
  const count=kind==='winners'?matchCount(s.bracket_size,r):loserMatchCount(s.bracket_size,r);
  const title=kind==='winners'?roundLabel(s.bracket_size,r):loserRoundLabel(s.bracket_size,r);
  const desc=kind==='winners'
    ? 'Win to stay in the upper bracket. Your first loss sends you to the Losers Bracket.'
    : (r%2===0?'This round receives players dropping from the Winners Bracket.':'Lose here and you are eliminated from the tournament.');

  return `${roundTabsMarkup(kind,s)}
    <section class="focus-round-card ${kind}">
      <div class="focus-round-head"><div><span>${kind==='winners'?'UPPER BRACKET':'LOWER BRACKET'}</span><h3>${esc(title)}</h3></div><p>${desc}</p></div>
      <div class="focus-match-grid">
        ${Array.from({length:count},(_,m)=>{
          const a=kind==='winners'?wbParticipant(r,m,0,s):lbParticipant(r,m,0,s);
          const b=kind==='winners'?wbParticipant(r,m,1,s):lbParticipant(r,m,1,s);
          const winner=kind==='winners'?wbWinner(s,r,m):lbWinner(s,r,m);
          const key=kind==='winners'?wbKey(r,m):lbKey(r,m);
          return `<article class="focus-match ${winner?'complete':''}">
            <div class="focus-match-head"><strong>Match ${m+1}</strong>${winner?'<span>Complete</span>':'<span>Waiting</span>'}</div>
            ${matchSlotMarkup(a,winner,key,s)}
            <div class="focus-vs">VS</div>
            ${matchSlotMarkup(b,winner,key,s)}
          </article>`;
        }).join('')}
      </div>
    </section>`;
}

function finalSlotMarkup(playerId,winnerId,key,s){
  return matchSlotMarkup(playerId,winnerId,key,s);
}

function renderFinals(s){
  const wbRounds=roundCount(s.bracket_size);
  const lbRounds=loserRoundCount(s.bracket_size);
  const wbChamp=wbWinner(s,wbRounds,0);
  const lbChamp=lbWinner(s,lbRounds,0);
  const gfWinner=s.winners.GF||null;
  const resetNeeded=Boolean(gfWinner&&lbChamp&&String(gfWinner)===String(lbChamp));
  const rfWinner=s.winners.RF||null;
  let champion=null;
  if(gfWinner&&wbChamp&&String(gfWinner)===String(wbChamp))champion=gfWinner;
  if(resetNeeded&&rfWinner)champion=rfWinner;
  const champ=champion?playerById.get(String(champion)):null;

  return `<section class="finals-clean-grid">
    <article class="finals-clean-card">
      <div class="finals-card-head"><span>GRAND FINAL</span><h3>Winners Champ vs Losers Champ</h3></div>
      <div class="finals-match">
        ${finalSlotMarkup(wbChamp,gfWinner,'GF',s)}
        <div class="focus-vs">VS</div>
        ${finalSlotMarkup(lbChamp,gfWinner,'GF',s)}
      </div>
      <p>If the Losers Bracket champion wins this match, a bracket reset is required.</p>
    </article>
    <article class="finals-clean-card ${resetNeeded?'':'disabled-final'}">
      <div class="finals-card-head"><span>BRACKET RESET</span><h3>${resetNeeded?'Final deciding match':'Only appears if needed'}</h3></div>
      ${resetNeeded?`<div class="finals-match">${finalSlotMarkup(wbChamp,rfWinner,'RF',s)}<div class="focus-vs">VS</div>${finalSlotMarkup(lbChamp,rfWinner,'RF',s)}</div>`:'<div class="final-placeholder">No reset is required yet.</div>'}
    </article>
    <article class="finals-clean-card champion-card">
      <div class="finals-card-head"><span>CHAMPION</span><h3>${esc(currentKit().name)}</h3></div>
      <div class="clean-champion">${champ?`${headImg(champ,56,champ.name)}<strong>${esc(champ.name)}</strong><small>🏆 Tournament Champion</small>`:'<strong>TBD</strong><small>Finals are not complete yet</small>'}</div>
    </article>
  </section>`;
}

function placementLabel(i){return ['1st','2nd','3rd','4th','5th','6th','7th','8th'][i]}
function placementIcon(i){return ['🏆','🥈','🥉','4','5','6','7','8'][i]}

function renderTop8(s){
  const places=topEightPlacements(s);
  return `<section class="top8-clean-card">
    <div class="top8-head"><div><span>FINAL STANDINGS</span><h3>${esc(currentKit().name)} Top 8</h3></div><p>Standings fill automatically as players are eliminated. Same-round ties use original seed order.</p></div>
    <div class="top8-grid">${places.map((pid,i)=>{
      const p=pid?playerById.get(String(pid)):null;
      return `<div class="top8-row place-${i+1} ${p?'':'tbd'}"><b>${placementIcon(i)}</b><span>${placementLabel(i)}</span><div>${p?`${headImg(p,38,p.name)}<strong>${esc(p.name)}</strong>`:'<strong>TBD</strong>'}</div></div>`;
    }).join('')}</div>
  </section>`;
}

function wireBracketControls(){
  document.querySelectorAll('[data-bracket-view]').forEach(btn=>btn.onclick=()=>{
    activeView=btn.dataset.bracketView;
    renderBracket();
  });
  document.querySelectorAll('[data-round-kind]').forEach(btn=>btn.onclick=()=>{
    const r=Number(btn.dataset.round);
    if(btn.dataset.roundKind==='winners')activeWinnerRound=r;
    else activeLoserRound=r;
    renderBracket();
  });
  document.querySelectorAll('[data-advance-key]').forEach(btn=>btn.onclick=()=>{
    advanceMatch(btn.dataset.advanceKey,btn.dataset.advancePlayer);
  });
}

function renderBracket(){
  const s=state();
  const kit=currentKit();
  const filled=s.seeds.filter(Boolean).length;
  const placements=topEightPlacements(s);
  const championReady=Boolean(placements[0]);

  $('#bracketEyebrow').textContent=`${kit.name.toUpperCase()} DOUBLE ELIMINATION`;
  $('#bracketTitle').textContent=`${kit.name} Tournament`;
  $('#bracketMeta').innerHTML=`<span>${s.bracket_size} slots</span><span>${filled} players</span><span>${s.started?'Live':'Setup'}</span><span>${championReady?'Champion set':'In progress'}</span>`;

  if(!filled){
    $('#bracketViewport').innerHTML=`<div class="tournament-empty"><div><b>No players seeded yet.</b>${isOwner()?'Add players above, then drag them into their Round 1 opponents.':'The Owner has not seeded this bracket yet.'}</div></div>`;
    return;
  }

  let content='';
  if(activeView==='winners')content=renderRound('winners',s);
  else if(activeView==='losers')content=renderRound('losers',s);
  else if(activeView==='finals')content=renderFinals(s);
  else content=renderTop8(s);

  $('#bracketViewport').innerHTML=`${viewTabsMarkup()}<div class="clean-view-body">${content}</div>`;
  wireBracketControls();
  bindHeadFallbacks($('#bracketViewport'));
}

function renderAll(){
  renderAccess();
  renderOwnerControls();
  renderBracket();
}

async function detectAccess(){
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){accessRole='public';return}
    const {data,error}=await supabase.rpc('get_my_access');
    if(error){accessRole='public';return}
    const row=Array.isArray(data)?data[0]:data;
    accessRole=row?.role==='owner'?'owner':row?.role==='admin'?'admin':'public';
  }catch{accessRole='public'}
}

function subscribe(){
  try{
    supabase.channel('nova-tournament-v4')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'tournament_brackets'},payload=>{
        const incoming=normalizeBracket(payload.new);
        const existing=brackets.get(incoming.gamemode);
        if(existing&&incoming.revision<=existing.revision)return;
        brackets.set(incoming.gamemode,incoming);
        if(incoming.gamemode===currentMode)renderAll();
      })
      .subscribe();
  }catch{}
}

async function load(){
  try{
    supabase=await getSupabase();
    const [playersRes,bracketsRes,assetsRes]=await Promise.all([
      supabase.from('players').select('id,name,avatar_url,minecraft_uuid').order('name'),
      supabase.from('tournament_brackets').select('gamemode,bracket_size,seeds,winners,started,revision,updated_at'),
      supabase.from('site_assets').select('asset_key,asset_value')
    ]);

    if(playersRes.error)throw playersRes.error;
    if(bracketsRes.error)throw bracketsRes.error;

    players=playersRes.data||[];
    playerById=new Map(players.map(p=>[String(p.id),p]));
    assets=rowsToAssets(assetsRes.data||[]);

    for(const g of GAMEMODES)brackets.set(g.id,blankBracket(g.id));
    for(const row of bracketsRes.data||[])setBracket(row);

    await detectAccess();
    const brand=$('#brandMark');
    if(brand)brand.innerHTML=iconMarkup(assetValue(assets,'brand_logo'),'brand-icon');

    renderNav();
    renderAll();
    subscribe();
  }catch(e){
    console.error(e);
    $('#bracketViewport').innerHTML=`<div class="empty"><b>Could not load tournament brackets.</b><br><br>${esc(e.message||e)}</div>`;
  }
}

load();
