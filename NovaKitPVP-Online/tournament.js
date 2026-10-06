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
let saving=false;

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

function normalizeResults(raw){
  const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const out={};
  for(const [key,value] of Object.entries(source)){
    if(/^\d+-\d+$/.test(key)) out[`W:${key}`]=value;
    else out[key]=value;
  }
  return out;
}

function blankBracket(gamemode,size=16){
  return {gamemode,bracket_size:size,seeds:Array(size).fill(null),winners:{},updated_at:null};
}

function normalizeBracket(row){
  const size=[4,8,16,32].includes(Number(row?.bracket_size))?Number(row.bracket_size):16;
  const rawSeeds=Array.isArray(row?.seeds)?row.seeds:[];
  const seeds=Array(size).fill(null).map((_,i)=>rawSeeds[i]||null);
  const winners=normalizeResults(row?.winners);
  return {...row,bracket_size:size,seeds,winners};
}

function roundCount(size){return Math.log2(size)}
function matchCount(size,roundNo){return size/(2**roundNo)}
function loserRoundCount(size){return Math.max(0,(roundCount(size)*2)-2)}
function loserMatchCount(size,lbRound){
  const stage=Math.ceil(lbRound/2);
  return size/(2**(stage+1));
}
function wbKey(r,m){return `W:${r}-${m}`}
function lbKey(r,m){return `L:${r}-${m}`}
function wbWinner(state,r,m){return state.winners[wbKey(r,m)]||null}
function lbWinner(state,r,m){return state.winners[lbKey(r,m)]||null}

function wbParticipant(roundNo,matchNo,side,state){
  if(roundNo===1)return state.seeds[(matchNo*2)+side]||null;
  return wbWinner(state,roundNo-1,(matchNo*2)+side);
}

function wbLoser(roundNo,matchNo,state){
  const a=wbParticipant(roundNo,matchNo,0,state);
  const b=wbParticipant(roundNo,matchNo,1,state);
  const winner=wbWinner(state,roundNo,matchNo);
  if(!winner)return null;
  if(String(winner)===String(a))return b||null;
  if(String(winner)===String(b))return a||null;
  return null;
}

function lbParticipant(lbRound,matchNo,side,state){
  const stage=Math.ceil(lbRound/2);

  if(lbRound===1){
    return wbLoser(1,(matchNo*2)+side,state);
  }

  if(lbRound%2===1){
    return lbWinner(state,lbRound-1,(matchNo*2)+side);
  }

  if(side===0){
    return lbWinner(state,lbRound-1,matchNo);
  }

  return wbLoser(stage+1,matchNo,state);
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

function loserRoundLabel(size,lbRound){
  const total=loserRoundCount(size);
  if(lbRound===total)return 'Losers Final';
  const matches=loserMatchCount(size,lbRound);
  if(matches===1)return `Losers Round ${lbRound}`;
  return `Losers Round ${lbRound}`;
}

function clearAllLoserAndFinals(results){
  const next={...results};
  for(const key of Object.keys(next)){
    if(key.startsWith('L:')||key==='GF'||key==='RF')delete next[key];
  }
  return next;
}

function clearAfterWinnersRound(results,roundNo,size){
  let next=clearAllLoserAndFinals(results);
  for(const key of Object.keys(next)){
    const m=key.match(/^W:(\d+)-/);
    if(m && Number(m[1])>roundNo)delete next[key];
  }
  return next;
}

function clearAfterLosersRound(results,lbRound){
  const next={...results};
  for(const key of Object.keys(next)){
    const m=key.match(/^L:(\d+)-/);
    if(m && Number(m[1])>lbRound)delete next[key];
    if(key==='GF'||key==='RF')delete next[key];
  }
  return next;
}

function renderNav(){
  $('#tournamentKitNav').innerHTML=GAMEMODES.map(g=>`
    <button class="tournament-kit-btn ${g.id===currentMode?'active':''}" data-tournament-mode="${g.id}">
      <span class="tournament-kit-icon">${kitIcon(g)}</span>${esc(g.name)}
    </button>`).join('');

  document.querySelectorAll('[data-tournament-mode]').forEach(btn=>{
    btn.onclick=()=>{
      currentMode=btn.dataset.tournamentMode;
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

function playerMarkup(playerId){
  const p=playerById.get(String(playerId));
  if(!p)return '<span class="tournament-seed-empty">Unknown / removed player</span>';
  return `${headImg(p,34,p.name)}<strong>${esc(p.name)}</strong>`;
}

function renderOwnerControls(){
  const panel=$('#ownerControls');
  if(!isOwner()){
    panel.classList.add('hidden');
    panel.innerHTML='';
    return;
  }

  const state=brackets.get(currentMode)||blankBracket(currentMode);
  const used=new Set(state.seeds.filter(Boolean).map(String));
  const available=players.filter(p=>!used.has(String(p.id)));
  const filled=state.seeds.filter(Boolean).length;

  panel.classList.remove('hidden');
  panel.innerHTML=`
    <div class="tournament-owner-top">
      <div class="tournament-owner-title">
        <h3>Owner Bracket Controls</h3>
        <p>Double elimination: first loss drops a player into the Losers Bracket; second loss eliminates them.</p>
      </div>
      <div class="tournament-owner-actions">
        <div class="tournament-control-field">
          <label>Bracket size</label>
          <select id="bracketSizeSelect">
            ${[4,8,16,32].map(n=>`<option value="${n}" ${state.bracket_size===n?'selected':''}>${n} players</option>`).join('')}
          </select>
        </div>
        <div class="tournament-control-field">
          <label>Add player</label>
          <select id="tournamentPlayerSelect" class="tournament-player-select" ${available.length?'':'disabled'}>
            ${available.length?available.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''):'<option>No players available</option>'}
          </select>
        </div>
        <button id="addTournamentPlayer" class="btn primary small" ${(!available.length||filled>=state.bracket_size)?'disabled':''}>+ Add</button>
        <button id="resetTournamentResults" class="btn small" ${Object.keys(state.winners).length?'':'disabled'}>Reset Results</button>
      </div>
    </div>
    <div class="tournament-seed-heading"><strong>Seeds / Starting Slots</strong><span>${filled}/${state.bracket_size} filled · arrows move players</span></div>
    <div class="tournament-seed-list">
      ${state.seeds.map((pid,i)=>`
        <div class="tournament-seed-row">
          <span class="tournament-seed-no">${i+1}</span>
          <span class="tournament-seed-player">${pid?playerMarkup(pid):'<span class="tournament-seed-empty">Empty seed</span>'}</span>
          <span class="tournament-seed-actions">
            ${pid?`<button title="Move up" data-seed-up="${i}" ${i===0?'disabled':''}>↑</button><button title="Move down" data-seed-down="${i}" ${i===state.bracket_size-1?'disabled':''}>↓</button><button title="Remove" class="remove" data-seed-remove="${i}">×</button>`:''}
          </span>
        </div>`).join('')}
    </div>`;

  $('#bracketSizeSelect').onchange=async e=>{
    const nextSize=Number(e.target.value);
    if(nextSize===state.bracket_size)return;
    if(nextSize<state.bracket_size && state.seeds.slice(nextSize).some(Boolean)){
      if(!confirm(`Changing to ${nextSize} slots will remove players seeded after #${nextSize}. Continue?`)){
        e.target.value=String(state.bracket_size);
        return;
      }
    }
    const nextSeeds=state.seeds.slice(0,nextSize);
    while(nextSeeds.length<nextSize)nextSeeds.push(null);
    await saveState({...state,bracket_size:nextSize,seeds:nextSeeds,winners:{}});
  };

  $('#addTournamentPlayer').onclick=async()=>{
    const pid=$('#tournamentPlayerSelect')?.value;
    if(!pid)return;
    const idx=state.seeds.findIndex(x=>!x);
    if(idx<0){toast('This bracket is full.');return}
    const next=[...state.seeds];next[idx]=pid;
    await saveState({...state,seeds:next,winners:{}});
  };

  $('#resetTournamentResults').onclick=async()=>{
    if(!confirm('Reset all Winners Bracket, Losers Bracket and Finals results for this kit? Seeds will stay in place.'))return;
    await saveState({...state,winners:{}});
  };

  document.querySelectorAll('[data-seed-up]').forEach(btn=>btn.onclick=async()=>{
    const i=Number(btn.dataset.seedUp);const next=[...state.seeds];
    [next[i-1],next[i]]=[next[i],next[i-1]];
    await saveState({...state,seeds:next,winners:{}});
  });

  document.querySelectorAll('[data-seed-down]').forEach(btn=>btn.onclick=async()=>{
    const i=Number(btn.dataset.seedDown);const next=[...state.seeds];
    [next[i+1],next[i]]=[next[i],next[i+1]];
    await saveState({...state,seeds:next,winners:{}});
  });

  document.querySelectorAll('[data-seed-remove]').forEach(btn=>btn.onclick=async()=>{
    const i=Number(btn.dataset.seedRemove);
    const p=playerById.get(String(state.seeds[i]));
    if(!confirm(`Remove ${p?.name||'this player'} from the ${currentKit().name} bracket?`))return;
    const next=[...state.seeds];
    next[i]=null;
    await saveState({...state,seeds:next,winners:{}});
  });

  bindHeadFallbacks(panel);
}

function slotMarkup(playerId,winnerId,kind,roundNo,matchNo){
  if(!playerId)return '<div class="tournament-slot tbd">TBD</div>';
  const p=playerById.get(String(playerId));
  if(!p)return '<div class="tournament-slot tbd">Unavailable player</div>';

  const selected=String(winnerId||'')===String(playerId);

  let data='';
  if(kind==='W') data=`data-wb-round="${roundNo}" data-wb-match="${matchNo}"`;
  if(kind==='L') data=`data-lb-round="${roundNo}" data-lb-match="${matchNo}"`;
  if(kind==='GF') data='data-final-type="GF"';
  if(kind==='RF') data='data-final-type="RF"';

  return `<div class="tournament-slot ${selected?'winner':''}">
    ${headImg(p,32,p.name)}
    <strong>${esc(p.name)}</strong>
    ${isOwner()?`<button class="tournament-advance ${selected?'active':''}" ${data} data-advance-player="${p.id}">${selected?'Advanced':'Advance'}</button>`:''}
  </div>`;
}

function bracketRoundSection({title,subtitle,kind,roundNo,matches,state,finalRound=false}){
  const gap=Math.max(18,(2**Math.floor((roundNo-1)/2))*14);
  const pad=Math.max(0,(2**Math.floor((roundNo-2)/2))*10);

  return `<section class="tournament-round ${finalRound?'final-round':''}">
    <div class="tournament-round-title"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div>
    <div class="tournament-round-matches" style="--match-gap:${gap}px;--round-pad:${pad}px">
      ${Array.from({length:matches},(_,m)=>{
        let a,b,winner;
        if(kind==='W'){
          a=wbParticipant(roundNo,m,0,state);
          b=wbParticipant(roundNo,m,1,state);
          winner=wbWinner(state,roundNo,m);
        }else{
          a=lbParticipant(roundNo,m,0,state);
          b=lbParticipant(roundNo,m,1,state);
          winner=lbWinner(state,roundNo,m);
        }

        return `<div class="tournament-match ${kind==='L'?'losers-match':''}">
          <div class="tournament-match-label">Match ${m+1}</div>
          ${slotMarkup(a,winner,kind,roundNo,m)}
          ${slotMarkup(b,winner,kind,roundNo,m)}
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

function renderWinnersBracket(state){
  const rounds=roundCount(state.bracket_size);
  const html=[];

  for(let r=1;r<=rounds;r++){
    const matches=matchCount(state.bracket_size,r);
    html.push(bracketRoundSection({
      title:roundLabel(state.bracket_size,r),
      subtitle:`${matches} match${matches===1?'':'es'}`,
      kind:'W',
      roundNo:r,
      matches,
      state,
      finalRound:r===rounds
    }));
  }

  return `<div class="tournament-bracket winners-bracket">${html.join('')}</div>`;
}

function renderLosersBracket(state){
  const total=loserRoundCount(state.bracket_size);
  const html=[];

  for(let r=1;r<=total;r++){
    const matches=loserMatchCount(state.bracket_size,r);
    const dropRound=r%2===0;
    html.push(bracketRoundSection({
      title:loserRoundLabel(state.bracket_size,r),
      subtitle:dropRound?'Winners Bracket loser drops in':`${matches} elimination match${matches===1?'':'es'}`,
      kind:'L',
      roundNo:r,
      matches,
      state,
      finalRound:r===total
    }));
  }

  return `<div class="tournament-bracket losers-bracket">${html.join('')}</div>`;
}

function renderFinals(state){
  const kit=currentKit();
  const wbRounds=roundCount(state.bracket_size);
  const lbRounds=loserRoundCount(state.bracket_size);

  const wbChamp=wbWinner(state,wbRounds,0);
  const lbChamp=lbWinner(state,lbRounds,0);
  const gfWinner=state.winners.GF||null;
  const resetNeeded=Boolean(gfWinner&&lbChamp&&String(gfWinner)===String(lbChamp));
  const rfWinner=state.winners.RF||null;

  let championId=null;
  if(gfWinner&&wbChamp&&String(gfWinner)===String(wbChamp))championId=gfWinner;
  if(resetNeeded&&rfWinner)championId=rfWinner;

  const champion=playerById.get(String(championId||''));

  return `<div class="tournament-finals-grid">
    <section class="tournament-final-card">
      <div class="tournament-round-title"><strong>Grand Final</strong><small>Winners Champ vs Losers Champ</small></div>
      <div class="tournament-match grand-final-match">
        ${slotMarkup(wbChamp,gfWinner,'GF',0,0)}
        ${slotMarkup(lbChamp,gfWinner,'GF',0,0)}
      </div>
      <p class="tournament-final-note">If the Losers Bracket champion wins, the bracket resets because both finalists now have one loss.</p>
    </section>

    <section class="tournament-final-card ${resetNeeded?'':'muted-final'}">
      <div class="tournament-round-title"><strong>Bracket Reset</strong><small>${resetNeeded?'Required':'Only if Losers Champ wins Grand Final'}</small></div>
      ${resetNeeded?`
        <div class="tournament-match reset-final-match">
          ${slotMarkup(wbChamp,rfWinner,'RF',0,0)}
          ${slotMarkup(lbChamp,rfWinner,'RF',0,0)}
        </div>`:`
        <div class="tournament-reset-placeholder">No reset required yet.</div>`}
    </section>

    <section class="tournament-final-card champion-final-card">
      <div class="tournament-round-title"><strong>Champion</strong><small>${esc(kit.name)}</small></div>
      <div class="tournament-champion">
        ${champion?`
          <div class="tournament-champion-inner">
            ${headImg(champion,52,champion.name)}
            <strong>${esc(champion.name)}</strong>
            <small>🏆 ${esc(kit.name)} Champion</small>
          </div>`:`
          <div class="tournament-champion-inner">
            <strong>TBD</strong>
            <small>Win the Grand Final${resetNeeded?' / Reset':''}</small>
          </div>`}
      </div>
    </section>
  </div>`;
}

function renderBracket(){
  const kit=currentKit();
  const state=brackets.get(currentMode)||blankBracket(currentMode);
  const filled=state.seeds.filter(Boolean).length;

  const wbRounds=roundCount(state.bracket_size);
  const lbRounds=loserRoundCount(state.bracket_size);
  const wbChamp=wbWinner(state,wbRounds,0);
  const lbChamp=lbWinner(state,lbRounds,0);
  const gfWinner=state.winners.GF||null;
  const resetNeeded=Boolean(gfWinner&&lbChamp&&String(gfWinner)===String(lbChamp));
  const championId=
    (gfWinner&&wbChamp&&String(gfWinner)===String(wbChamp))
      ? gfWinner
      : (resetNeeded?state.winners.RF:null);

  $('#bracketEyebrow').textContent=`${kit.name.toUpperCase()} DOUBLE ELIMINATION`;
  $('#bracketTitle').textContent=`${kit.name} Tournament`;
  $('#bracketMeta').innerHTML=`
    <span>${state.bracket_size} slots</span>
    <span>${filled} players</span>
    <span>Double elimination</span>
    <span>${championId?'Champion set':'In progress'}</span>`;

  if(!filled){
    $('#bracketViewport').innerHTML=`<div class="tournament-empty"><div><b>No players seeded yet.</b>${isOwner()?'Use Owner Bracket Controls above to add the first player.':'The Owner has not seeded this bracket yet.'}</div></div>`;
    return;
  }

  $('#bracketViewport').innerHTML=`
    <div class="tournament-section">
      <div class="tournament-section-head">
        <div><span class="tournament-section-kicker winners">UPPER BRACKET</span><h3>Winners Bracket</h3></div>
        <p>Win and advance. Lose once and you automatically drop into the Losers Bracket.</p>
      </div>
      <div class="tournament-bracket-scroll">${renderWinnersBracket(state)}</div>
    </div>

    <div class="tournament-section losers-section">
      <div class="tournament-section-head">
        <div><span class="tournament-section-kicker losers">LOWER BRACKET</span><h3>Losers Bracket</h3></div>
        <p>Players enter here after their first loss. A loss in this bracket eliminates them from the tournament.</p>
      </div>
      <div class="tournament-bracket-scroll">${renderLosersBracket(state)}</div>
    </div>

    <div class="tournament-section finals-section">
      <div class="tournament-section-head">
        <div><span class="tournament-section-kicker finals">FINALS</span><h3>Grand Final</h3></div>
        <p>The Winners Bracket champion faces the Losers Bracket champion. A reset final appears automatically if needed.</p>
      </div>
      ${renderFinals(state)}
    </div>`;

  if(isOwner()){
    document.querySelectorAll('[data-wb-round]').forEach(btn=>btn.onclick=async()=>{
      const roundNo=Number(btn.dataset.wbRound);
      const matchNo=Number(btn.dataset.wbMatch);
      const pid=btn.dataset.advancePlayer;
      const a=wbParticipant(roundNo,matchNo,0,state);
      const b=wbParticipant(roundNo,matchNo,1,state);

      if(String(pid)!==String(a)&&String(pid)!==String(b))return;

      let nextResults=clearAfterWinnersRound(state.winners,roundNo,state.bracket_size);
      nextResults[wbKey(roundNo,matchNo)]=pid;

      await saveState({...state,winners:nextResults});
    });

    document.querySelectorAll('[data-lb-round]').forEach(btn=>btn.onclick=async()=>{
      const roundNo=Number(btn.dataset.lbRound);
      const matchNo=Number(btn.dataset.lbMatch);
      const pid=btn.dataset.advancePlayer;
      const a=lbParticipant(roundNo,matchNo,0,state);
      const b=lbParticipant(roundNo,matchNo,1,state);

      if(String(pid)!==String(a)&&String(pid)!==String(b))return;

      let nextResults=clearAfterLosersRound(state.winners,roundNo);
      nextResults[lbKey(roundNo,matchNo)]=pid;

      await saveState({...state,winners:nextResults});
    });

    document.querySelectorAll('[data-final-type="GF"]').forEach(btn=>btn.onclick=async()=>{
      const pid=btn.dataset.advancePlayer;
      const wbChampNow=wbWinner(state,wbRounds,0);
      const lbChampNow=lbWinner(state,lbRounds,0);

      if(String(pid)!==String(wbChampNow)&&String(pid)!==String(lbChampNow))return;

      const next={...state.winners,GF:pid};
      delete next.RF;
      await saveState({...state,winners:next});
    });

    document.querySelectorAll('[data-final-type="RF"]').forEach(btn=>btn.onclick=async()=>{
      const pid=btn.dataset.advancePlayer;
      const wbChampNow=wbWinner(state,wbRounds,0);
      const lbChampNow=lbWinner(state,lbRounds,0);

      if(String(pid)!==String(wbChampNow)&&String(pid)!==String(lbChampNow))return;

      await saveState({...state,winners:{...state.winners,RF:pid}});
    });
  }

  bindHeadFallbacks($('#bracketViewport'));
}

function renderAll(){
  renderAccess();
  renderOwnerControls();
  renderBracket();
}

async function saveState(next){
  if(!isOwner()||saving)return;
  saving=true;
  try{
    const {error}=await supabase.rpc('set_tournament_bracket',{
      target_gamemode:next.gamemode||currentMode,
      target_size:next.bracket_size,
      target_seeds:next.seeds,
      target_winners:next.winners
    });

    if(error)throw error;

    brackets.set(currentMode,normalizeBracket({...next,updated_at:new Date().toISOString()}));
    renderAll();
    toast('Tournament bracket updated');
  }catch(e){
    toast(e.message||String(e));
  }finally{
    saving=false;
  }
}

async function detectAccess(){
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){accessRole='public';return}

    const {data,error}=await supabase.rpc('get_my_access');
    if(error){accessRole='public';return}

    const row=Array.isArray(data)?data[0]:data;
    accessRole=row?.role==='owner'?'owner':row?.role==='admin'?'admin':'public';
  }catch{
    accessRole='public';
  }
}

function subscribe(){
  try{
    supabase.channel('nova-tournament-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'tournament_brackets'},payload=>{
        if(payload.new?.gamemode){
          brackets.set(payload.new.gamemode,normalizeBracket(payload.new));
          if(payload.new.gamemode===currentMode)renderAll();
        }
      })
      .subscribe();
  }catch{}
}

async function load(){
  try{
    supabase=await getSupabase();

    const [playersRes,bracketsRes,assetsRes]=await Promise.all([
      supabase.from('players').select('id,name,avatar_url,minecraft_uuid').order('name'),
      supabase.from('tournament_brackets').select('gamemode,bracket_size,seeds,winners,updated_at'),
      supabase.from('site_assets').select('asset_key,asset_value')
    ]);

    if(playersRes.error)throw playersRes.error;
    if(bracketsRes.error)throw bracketsRes.error;

    players=playersRes.data||[];
    playerById=new Map(players.map(p=>[String(p.id),p]));
    assets=rowsToAssets(assetsRes.data||[]);

    for(const g of GAMEMODES)brackets.set(g.id,blankBracket(g.id));
    for(const row of bracketsRes.data||[])brackets.set(row.gamemode,normalizeBracket(row));

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
