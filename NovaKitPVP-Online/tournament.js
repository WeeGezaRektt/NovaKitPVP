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
let activeSection='winners';
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
  return {gamemode,bracket_size:size,seeds:Array(size).fill(null),winners:{},started:false,revision:0,updated_at:null};
}

function normalizeBracket(row){
  const size=[4,8,16,32].includes(Number(row?.bracket_size))?Number(row.bracket_size):16;
  const rawSeeds=Array.isArray(row?.seeds)?row.seeds:[];
  const winners=normalizeResults(row?.winners);
  return {
    ...row,
    bracket_size:size,
    seeds:Array(size).fill(null).map((_,i)=>rawSeeds[i]||null),
    winners,
    started:Boolean(row?.started)||Object.keys(winners).length>0,
    revision:Number(row?.revision||0)
  };
}

function setBracket(row){
  if(row?.gamemode)brackets.set(row.gamemode,normalizeBracket(row));
}

function state(){return brackets.get(currentMode)||blankBracket(currentMode)}
function roundCount(size){return Math.log2(size)}
function matchCount(size,roundNo){return size/(2**roundNo)}
function loserRoundCount(size){return Math.max(0,(roundCount(size)*2)-2)}
function loserMatchCount(size,roundNo){return size/(2**(Math.ceil(roundNo/2)+1))}
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

function lbParticipant(roundNo,matchNo,side,s){
  const stage=Math.ceil(roundNo/2);
  if(roundNo===1)return wbLoser(1,(matchNo*2)+side,s);
  if(roundNo%2===1)return lbWinner(s,roundNo-1,(matchNo*2)+side);
  if(side===0)return lbWinner(s,roundNo-1,matchNo);
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
  const i=s.seeds.findIndex(x=>String(x||'')===String(playerId||''));
  return i<0?9999:i;
}
function orderBySeed(s,ids){return ids.filter(Boolean).sort((a,b)=>seedIndex(s,a)-seedIndex(s,b))}

function topEightPlacements(s){
  const places=Array(8).fill(null);
  const wr=roundCount(s.bracket_size);
  const lr=loserRoundCount(s.bracket_size);
  const wbChamp=wbWinner(s,wr,0);
  const lbChamp=lbWinner(s,lr,0);
  const gf=s.winners.GF||null;
  const resetNeeded=Boolean(gf&&lbChamp&&String(gf)===String(lbChamp));
  const rf=s.winners.RF||null;

  if(gf&&wbChamp&&String(gf)===String(wbChamp)){
    places[0]=gf; places[1]=lbChamp||null;
  }else if(resetNeeded&&rf){
    places[0]=rf;
    places[1]=String(rf)===String(wbChamp)?lbChamp:wbChamp;
  }

  if(lr>=1)places[2]=lbLoser(lr,0,s);
  if(lr>=2)places[3]=lbLoser(lr-1,0,s);

  if(lr>=3){
    const n=loserMatchCount(s.bracket_size,lr-2);
    const list=orderBySeed(s,Array.from({length:n},(_,m)=>lbLoser(lr-2,m,s)));
    places[4]=list[0]||null; places[5]=list[1]||null;
  }
  if(lr>=4){
    const n=loserMatchCount(s.bracket_size,lr-3);
    const list=orderBySeed(s,Array.from({length:n},(_,m)=>lbLoser(lr-3,m,s)));
    places[6]=list[0]||null; places[7]=list[1]||null;
  }
  return places;
}

function roundLabel(size,r){
  const m=matchCount(size,r);
  if(m===1)return 'Final';
  if(m===2)return 'Semifinals';
  if(m===4)return 'Quarterfinals';
  if(m===8)return 'Round of 16';
  if(m===16)return 'Round of 32';
  return `Round ${r}`;
}

function loserRoundLabel(size,r){
  return r===loserRoundCount(size)?'Losers Final':`Losers Round ${r}`;
}

function renderNav(){
  $('#tournamentKitNav').innerHTML=GAMEMODES.map(g=>`
    <button class="tournament-kit-btn ${g.id===currentMode?'active':''}" data-mode="${g.id}">
      <span class="tournament-kit-icon">${kitIcon(g)}</span><span>${esc(g.name)}</span>
    </button>`).join('');

  document.querySelectorAll('[data-mode]').forEach(btn=>btn.onclick=()=>{
    currentMode=btn.dataset.mode;
    selectedSetupSlot=null;
    activeSection='winners';
    activeWinnerRound=1;
    activeLoserRound=1;
    renderNav();
    renderAll();
  });
}

function renderAccess(){
  const badge=$('#accessBadge');
  if(isOwner()){
    badge.className='tournament-access-badge owner';
    badge.textContent='Owner controls';
  }else if(accessRole==='admin'){
    badge.className='tournament-access-badge staff';
    badge.textContent='Read only';
  }else{
    badge.className='tournament-access-badge public';
    badge.textContent='Live bracket';
  }
}

function playerMarkup(id,size=32){
  const p=playerById.get(String(id));
  if(!p)return '<span class="empty-player">Empty</span>';
  return `${headImg(p,size,p.name)}<strong>${esc(p.name)}</strong>`;
}

async function refreshCurrentBracket(){
  const {data,error}=await supabase.from('tournament_brackets')
    .select('gamemode,bracket_size,seeds,winners,started,revision,updated_at')
    .eq('gamemode',currentMode).single();
  if(error)throw error;
  setBracket(data);
  renderAll();
}

async function runOwnerRpc(name,args,message){
  if(!isOwner()||busy)return null;
  busy=true;
  document.body.classList.add('tournament-busy');
  try{
    const {data,error}=await supabase.rpc(name,args);
    if(error)throw error;
    const row=rpcRow(data);
    if(row)setBracket(row);
    renderAll();
    if(message)toast(message);
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
  const row=await runOwnerRpc('start_tournament',{
    target_gamemode:currentMode,
    target_expected_revision:s.revision
  },'Tournament started');
  if(row){
    activeSection='winners';
    activeWinnerRound=1;
    renderBracket();
  }
}

async function resetTournament(){
  const s=state();
  return runOwnerRpc('reset_tournament_results',{
    target_gamemode:currentMode,
    target_expected_revision:s.revision
  },'Results reset · matchup editing unlocked');
}

function roundIsComplete(kind,s,r){
  const count=kind==='winners'?matchCount(s.bracket_size,r):loserMatchCount(s.bracket_size,r);
  for(let m=0;m<count;m++){
    const a=kind==='winners'?wbParticipant(r,m,0,s):lbParticipant(r,m,0,s);
    const b=kind==='winners'?wbParticipant(r,m,1,s):lbParticipant(r,m,1,s);
    if(!a||!b)return false;
    const w=kind==='winners'?wbWinner(s,r,m):lbWinner(s,r,m);
    if(!w)return false;
  }
  return count>0;
}

async function advanceMatch(key,playerId,kind,roundNo){
  const s=state();
  if(!s.started){toast('Start the tournament first.');return}
  if(s.winners[key]){toast('That match is already complete.');return}
  const row=await runOwnerRpc('advance_tournament_match',{
    target_gamemode:currentMode,
    target_match_key:key,
    target_winner_id:playerId,
    target_expected_revision:s.revision
  },'Winner advanced');
  if(row){
    const next=normalizeBracket(row);
    const max=kind==='winners'?roundCount(next.bracket_size):loserRoundCount(next.bracket_size);
    if(roundNo<max && roundIsComplete(kind,next,roundNo)){
      if(kind==='winners')activeWinnerRound=roundNo+1;
      else activeLoserRound=roundNo+1;
      renderBracket();
    }
  }
}

function setupSlot(s,index){
  const pid=s.seeds[index];
  const p=pid?playerById.get(String(pid)):null;
  const selected=selectedSetupSlot===index;
  const editable=isOwner()&&!s.started;

  return `<div class="setup-player-slot ${p?'filled':'empty'} ${selected?'selected':''}" data-setup-slot="${index}">
    ${p?`
      <div class="setup-player-main" ${editable?'draggable="true"':''} data-drag-slot="${index}">
        ${headImg(p,38,p.name)}
        <span><strong>${esc(p.name)}</strong><small>${editable?'Drag or tap to swap':'Tournament player'}</small></span>
      </div>
      ${editable?`<button class="setup-remove" data-remove="${index}" title="Remove">×</button>`:''}`:
      `<span class="setup-empty">Empty slot</span>`}
  </div>`;
}

function swapSetupSlots(from,to){
  if(from===to){selectedSetupSlot=null;renderBracket();return}
  const s=state();
  if(s.started||!isOwner())return;
  const next=[...s.seeds];
  [next[from],next[to]]=[next[to],next[from]];
  selectedSetupSlot=null;
  saveSetup(next,s.bracket_size,'Matchup updated');
}

function wireSetup(){
  if(!isOwner()||state().started)return;

  document.querySelectorAll('[data-drag-slot]').forEach(el=>{
    el.addEventListener('dragstart',e=>{
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',el.dataset.dragSlot);
      el.closest('.setup-player-slot')?.classList.add('dragging');
    });
    el.addEventListener('dragend',()=>el.closest('.setup-player-slot')?.classList.remove('dragging'));
  });

  document.querySelectorAll('[data-setup-slot]').forEach(slot=>{
    slot.addEventListener('dragover',e=>{e.preventDefault();slot.classList.add('drag-over')});
    slot.addEventListener('dragleave',()=>slot.classList.remove('drag-over'));
    slot.addEventListener('drop',e=>{
      e.preventDefault();
      slot.classList.remove('drag-over');
      const from=Number(e.dataTransfer.getData('text/plain'));
      const to=Number(slot.dataset.setupSlot);
      if(Number.isInteger(from)&&Number.isInteger(to))swapSetupSlots(from,to);
    });
    slot.addEventListener('click',e=>{
      if(e.target.closest('[data-remove]'))return;
      const to=Number(slot.dataset.setupSlot);
      const s=state();
      if(selectedSetupSlot===null){
        if(!s.seeds[to])return;
        selectedSetupSlot=to;
        renderBracket();
      }else{
        swapSetupSlots(selectedSetupSlot,to);
      }
    });
  });

  document.querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const i=Number(btn.dataset.remove);
    const s=state();
    const p=playerById.get(String(s.seeds[i]));
    if(!confirm(`Remove ${p?.name||'this player'} from the tournament?`))return;
    const next=[...s.seeds];
    next[i]=null;
    selectedSetupSlot=null;
    saveSetup(next,s.bracket_size,'Player removed');
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

  panel.classList.remove('hidden');

  if(s.started){
    panel.innerHTML=`
      <div class="owner-simple-bar">
        <div><span class="owner-dot live"></span><strong>Tournament is live</strong><small>Matchups are locked so results cannot jump backwards.</small></div>
        <button id="resetTournamentResults" class="btn danger small">Reset Results & Unlock Setup</button>
      </div>`;
    $('#resetTournamentResults').onclick=()=>{
      if(confirm(`Reset all ${currentKit().name} results? Matchups will stay, but the tournament returns to setup mode.`))resetTournament();
    };
    return;
  }

  panel.innerHTML=`
    <div class="owner-simple-bar setup">
      <div><span class="owner-dot"></span><strong>Setup mode</strong><small>Add players, then drag/tap them into the opponents you want.</small></div>
      <div class="owner-simple-actions">
        <label>Size
          <select id="bracketSizeSelect">${[4,8,16,32].map(n=>`<option value="${n}" ${s.bracket_size===n?'selected':''}>${n}</option>`).join('')}</select>
        </label>
        <select id="tournamentPlayerSelect" ${available.length?'':'disabled'}>
          ${available.length?available.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''):'<option>No players left to add</option>'}
        </select>
        <button id="addTournamentPlayer" class="btn small" ${(!available.length||filled>=s.bracket_size)?'disabled':''}>+ Add Player</button>
        <button id="startTournament" class="btn primary small" ${filled<2?'disabled':''}>Start Tournament</button>
      </div>
    </div>`;

  $('#bracketSizeSelect').onchange=async e=>{
    const nextSize=Number(e.target.value);
    if(nextSize===s.bracket_size)return;
    if(nextSize<s.bracket_size&&s.seeds.slice(nextSize).some(Boolean)){
      if(!confirm(`Changing to ${nextSize} removes players after slot ${nextSize}. Continue?`)){
        e.target.value=String(s.bracket_size);
        return;
      }
    }
    const next=s.seeds.slice(0,nextSize);
    while(next.length<nextSize)next.push(null);
    selectedSetupSlot=null;
    await saveSetup(next,nextSize,'Bracket size updated');
  };

  $('#addTournamentPlayer').onclick=async()=>{
    const pid=$('#tournamentPlayerSelect')?.value;
    if(!pid)return;
    const i=s.seeds.findIndex(x=>!x);
    if(i<0){toast('Bracket is full.');return}
    const next=[...s.seeds];
    next[i]=pid;
    await saveSetup(next,s.bracket_size,'Player added');
  };

  $('#startTournament').onclick=()=>{
    if(confirm(`Start ${currentKit().name} with these matchups? You cannot move players after this unless you reset results.`))startTournament();
  };
}

function renderSetupBoard(s){
  const matches=s.bracket_size/2;
  return `
    <div class="simple-info setup-info">
      <span>1</span><div><strong>Build the first round</strong><small>${isOwner()?'Drag a player onto another player to swap them. On mobile: tap one player, then tap another slot.':'The Owner is choosing the first-round opponents.'}</small></div>
    </div>
    <div class="setup-match-grid">
      ${Array.from({length:matches},(_,m)=>`
        <article class="setup-match-card">
          <div class="setup-match-head"><strong>Match ${m+1}</strong><span>Round 1</span></div>
          <div class="setup-opponents">
            ${setupSlot(s,m*2)}
            <b>VS</b>
            ${setupSlot(s,m*2+1)}
          </div>
        </article>`).join('')}
    </div>`;
}

function sectionButtons(){
  const buttons=[
    ['winners','Winners Bracket','Stay undefeated'],
    ['losers','Losers Bracket','Second chance'],
    ['finals','Finals','For the title'],
    ['top8','Top 8','Final places']
  ];
  return `<div class="section-switcher">${buttons.map(([id,label,sub])=>`
    <button class="${activeSection===id?'active':''}" data-section="${id}">
      <strong>${label}</strong><small>${sub}</small>
    </button>`).join('')}</div>`;
}

function playerRow(playerId,winnerId,key,s,kind,roundNo){
  if(!playerId)return `<div class="match-player empty"><span>TBD</span></div>`;
  const p=playerById.get(String(playerId));
  if(!p)return `<div class="match-player empty"><span>Unavailable</span></div>`;
  const won=String(winnerId||'')===String(playerId);
  const done=Boolean(winnerId);

  return `<div class="match-player ${won?'won':done?'lost':''}">
    ${headImg(p,36,p.name)}
    <div><strong>${esc(p.name)}</strong><small>${won?'Advanced':done?'Lost this match':''}</small></div>
    ${isOwner()&&s.started&&!done?`<button class="advance-clean" data-advance-key="${key}" data-advance-player="${p.id}" data-kind="${kind}" data-round="${roundNo}">Advance</button>`:''}
    ${won?'<span class="won-check">✓</span>':''}
  </div>`;
}

function renderRoundSection(kind,s){
  const isW=kind==='winners';
  const max=isW?roundCount(s.bracket_size):loserRoundCount(s.bracket_size);

  if(isW)activeWinnerRound=Math.min(Math.max(1,activeWinnerRound),max);
  else activeLoserRound=Math.min(Math.max(1,activeLoserRound),max);

  const r=isW?activeWinnerRound:activeLoserRound;
  const count=isW?matchCount(s.bracket_size,r):loserMatchCount(s.bracket_size,r);
  const label=isW?roundLabel(s.bracket_size,r):loserRoundLabel(s.bracket_size,r);

  const helper=isW
    ? 'Winner moves forward. Loser drops to the Losers Bracket.'
    : 'Winner stays alive. Loser is eliminated from the tournament.';

  return `
    <div class="round-toolbar">
      <button class="round-arrow" data-round-move="-1" data-kind="${kind}" ${r<=1?'disabled':''}>‹</button>
      <div><span>${isW?'WINNERS BRACKET':'LOSERS BRACKET'}</span><strong>${esc(label)}</strong><small>Round ${r} of ${max}</small></div>
      <button class="round-arrow" data-round-move="1" data-kind="${kind}" ${r>=max?'disabled':''}>›</button>
    </div>
    <div class="round-explain">${helper}</div>
    <div class="simple-match-grid">
      ${Array.from({length:count},(_,m)=>{
        const a=isW?wbParticipant(r,m,0,s):lbParticipant(r,m,0,s);
        const b=isW?wbParticipant(r,m,1,s):lbParticipant(r,m,1,s);
        const winner=isW?wbWinner(s,r,m):lbWinner(s,r,m);
        const key=isW?wbKey(r,m):lbKey(r,m);
        return `<article class="simple-match-card ${winner?'complete':''}">
          <div class="simple-match-head"><strong>Match ${m+1}</strong><span>${winner?'Complete':'Waiting'}</span></div>
          ${playerRow(a,winner,key,s,kind,r)}
          <div class="simple-vs">VS</div>
          ${playerRow(b,winner,key,s,kind,r)}
        </article>`;
      }).join('')}
    </div>`;
}

function renderFinals(s){
  const wr=roundCount(s.bracket_size);
  const lr=loserRoundCount(s.bracket_size);
  const wbChamp=wbWinner(s,wr,0);
  const lbChamp=lbWinner(s,lr,0);
  const gf=s.winners.GF||null;
  const resetNeeded=Boolean(gf&&lbChamp&&String(gf)===String(lbChamp));
  const rf=s.winners.RF||null;

  let champion=null;
  if(gf&&wbChamp&&String(gf)===String(wbChamp))champion=gf;
  if(resetNeeded&&rf)champion=rf;

  const champ=champion?playerById.get(String(champion)):null;

  return `<div class="finals-simple">
    <article class="final-card">
      <div class="final-label">GRAND FINAL</div>
      <h3>Winners Champion vs Losers Champion</h3>
      ${playerRow(wbChamp,gf,'GF',s,'finals',1)}
      <div class="simple-vs">VS</div>
      ${playerRow(lbChamp,gf,'GF',s,'finals',1)}
      <p>If the Losers Bracket champion wins, one final reset match is played.</p>
    </article>

    <article class="final-card ${resetNeeded?'':'inactive'}">
      <div class="final-label">RESET FINAL</div>
      <h3>${resetNeeded?'Final deciding match':'Only used if needed'}</h3>
      ${resetNeeded?`${playerRow(wbChamp,rf,'RF',s,'finals',1)}<div class="simple-vs">VS</div>${playerRow(lbChamp,rf,'RF',s,'finals',1)}`:'<div class="final-empty">No bracket reset needed yet.</div>'}
    </article>

    <article class="final-card champion">
      <div class="final-label">CHAMPION</div>
      <h3>${esc(currentKit().name)}</h3>
      <div class="champion-simple">
        ${champ?`${headImg(champ,58,champ.name)}<strong>${esc(champ.name)}</strong><small>🏆 Tournament Champion</small>`:'<strong>TBD</strong><small>Finish the finals to crown a champion</small>'}
      </div>
    </article>
  </div>`;
}

function renderTop8(s){
  const places=topEightPlacements(s);
  const labels=['1st','2nd','3rd','4th','5th','6th','7th','8th'];
  const icons=['🏆','🥈','🥉','4','5','6','7','8'];

  return `<div class="top8-simple">
    <div class="top8-title"><div><span>FINAL STANDINGS</span><h3>${esc(currentKit().name)} Top 8</h3></div><small>Updates automatically as players are eliminated.</small></div>
    <div class="top8-list">
      ${places.map((pid,i)=>{
        const p=pid?playerById.get(String(pid)):null;
        return `<div class="top8-item place-${i+1} ${p?'':'empty'}">
          <b>${icons[i]}</b><span>${labels[i]}</span>
          <div>${p?`${headImg(p,38,p.name)}<strong>${esc(p.name)}</strong>`:'<strong>TBD</strong>'}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function wireBracket(){
  document.querySelectorAll('[data-section]').forEach(btn=>btn.onclick=()=>{
    activeSection=btn.dataset.section;
    renderBracket();
  });

  document.querySelectorAll('[data-round-move]').forEach(btn=>btn.onclick=()=>{
    const delta=Number(btn.dataset.roundMove);
    if(btn.dataset.kind==='winners')activeWinnerRound+=delta;
    else activeLoserRound+=delta;
    renderBracket();
  });

  document.querySelectorAll('[data-advance-key]').forEach(btn=>btn.onclick=()=>{
    advanceMatch(
      btn.dataset.advanceKey,
      btn.dataset.advancePlayer,
      btn.dataset.kind,
      Number(btn.dataset.round||1)
    );
  });
}

function renderBracket(){
  const s=state();
  const kit=currentKit();
  const filled=s.seeds.filter(Boolean).length;
  const championReady=Boolean(topEightPlacements(s)[0]);

  $('#bracketEyebrow').textContent=`${kit.name.toUpperCase()} TOURNAMENT`;
  $('#bracketTitle').textContent=kit.name;
  $('#bracketMeta').innerHTML=`
    <span>${filled}/${s.bracket_size} players</span>
    <span>${s.started?'Live':'Setup'}</span>
    <span>${championReady?'Champion set':'In progress'}</span>`;

  if(!filled){
    $('#bracketViewport').innerHTML=`<div class="tournament-empty"><div><b>No players added yet.</b>${isOwner()?'Use the Owner controls above to add players.':'The bracket has not been set up yet.'}</div></div>`;
    return;
  }

  if(!s.started){
    $('#bracketViewport').innerHTML=renderSetupBoard(s);
    wireSetup();
    bindHeadFallbacks($('#bracketViewport'));
    return;
  }

  let body='';
  if(activeSection==='winners')body=renderRoundSection('winners',s);
  else if(activeSection==='losers')body=renderRoundSection('losers',s);
  else if(activeSection==='finals')body=renderFinals(s);
  else body=renderTop8(s);

  $('#bracketViewport').innerHTML=`
    <div class="how-it-works">
      <div><b>1</b><span><strong>Win</strong><small>Move forward</small></span></div>
      <div><b>2</b><span><strong>First loss</strong><small>Drop to Losers</small></span></div>
      <div><b>3</b><span><strong>Second loss</strong><small>Eliminated</small></span></div>
    </div>
    ${sectionButtons()}
    <div class="simple-stage">${body}</div>`;

  wireBracket();
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
    supabase.channel('nova-tournament-v5')
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
