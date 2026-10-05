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

function blankBracket(gamemode,size=16){
  return {gamemode,bracket_size:size,seeds:Array(size).fill(null),winners:{},updated_at:null};
}

function normalizeBracket(row){
  const size=[4,8,16,32].includes(Number(row?.bracket_size))?Number(row.bracket_size):16;
  const rawSeeds=Array.isArray(row?.seeds)?row.seeds:[];
  const seeds=Array(size).fill(null).map((_,i)=>rawSeeds[i]||null);
  const winners=row?.winners&&typeof row.winners==='object'&&!Array.isArray(row.winners)?{...row.winners}:{};
  return {...row,bracket_size:size,seeds,winners};
}

function participant(roundNo,matchNo,side,state){
  if(roundNo===1)return state.seeds[(matchNo*2)+side]||null;
  return state.winners[`${roundNo-1}-${(matchNo*2)+side}`]||null;
}

function roundCount(size){return Math.log2(size)}
function matchCount(size,roundNo){return size/(2**roundNo)}
function roundLabel(size,roundNo){
  const matches=matchCount(size,roundNo);
  if(matches===1)return 'Final';
  if(matches===2)return 'Semifinals';
  if(matches===4)return 'Quarterfinals';
  if(matches===8)return 'Round of 16';
  if(matches===16)return 'Round of 32';
  return `Round ${roundNo}`;
}

function clearWinnerPath(winners,roundNo,matchNo,size){
  const next={...winners};
  let idx=matchNo;
  for(let r=roundNo+1;r<=roundCount(size);r++){
    idx=Math.floor(idx/2);
    delete next[`${r}-${idx}`];
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
        <p>Only Owners can change this. Admins, Testers and public visitors are read-only.</p>
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
    if(!confirm('Reset all advanced winners for this kit? Seeds will stay in place.'))return;
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
    const i=Number(btn.dataset.seedRemove);const p=playerById.get(String(state.seeds[i]));
    if(!confirm(`Remove ${p?.name||'this player'} from the ${currentKit().name} bracket?`))return;
    const next=[...state.seeds];next[i]=null;
    await saveState({...state,seeds:next,winners:{}});
  });

  bindHeadFallbacks(panel);
}

function slotMarkup(playerId,winnerId,roundNo,matchNo){
  if(!playerId)return '<div class="tournament-slot tbd">TBD</div>';
  const p=playerById.get(String(playerId));
  if(!p)return '<div class="tournament-slot tbd">Unavailable player</div>';
  const selected=String(winnerId||'')===String(playerId);
  return `<div class="tournament-slot ${selected?'winner':''}">
    ${headImg(p,32,p.name)}
    <strong>${esc(p.name)}</strong>
    ${isOwner()?`<button class="tournament-advance ${selected?'active':''}" data-advance-round="${roundNo}" data-advance-match="${matchNo}" data-advance-player="${p.id}">${selected?'Advanced':'Advance'}</button>`:''}
  </div>`;
}

function renderBracket(){
  const kit=currentKit();
  const state=brackets.get(currentMode)||blankBracket(currentMode);
  const rounds=roundCount(state.bracket_size);
  const filled=state.seeds.filter(Boolean).length;
  const championId=state.winners[`${rounds}-0`]||null;
  const champion=playerById.get(String(championId||''));

  $('#bracketEyebrow').textContent=`${kit.name.toUpperCase()} TOURNAMENT`;
  $('#bracketTitle').textContent=`${kit.name} Bracket`;
  $('#bracketMeta').innerHTML=`<span>${state.bracket_size} slots</span><span>${filled} players</span><span>${champion?'Champion set':'In progress'}</span>`;

  const roundHtml=[];
  for(let r=1;r<=rounds;r++){
    const matches=matchCount(state.bracket_size,r);
    const gap=Math.max(18,(2**(r-1))*18);
    const pad=r===1?0:Math.max(8,(2**(r-2))*22);
    roundHtml.push(`<section class="tournament-round ${r===rounds?'final-round':''}">
      <div class="tournament-round-title"><strong>${roundLabel(state.bracket_size,r)}</strong><small>${matches} match${matches===1?'':'es'}</small></div>
      <div class="tournament-round-matches" style="--match-gap:${gap}px;--round-pad:${pad}px">
        ${Array.from({length:matches},(_,m)=>{
          const a=participant(r,m,0,state),b=participant(r,m,1,state),winner=state.winners[`${r}-${m}`]||null;
          return `<div class="tournament-match">
            <div class="tournament-match-label">Match ${m+1}</div>
            ${slotMarkup(a,winner,r,m)}
            ${slotMarkup(b,winner,r,m)}
          </div>`;
        }).join('')}
      </div>
    </section>`);
  }

  roundHtml.push(`<section class="tournament-round champion-round">
    <div class="tournament-round-title"><strong>Champion</strong><small>${kit.name}</small></div>
    <div class="tournament-round-matches">
      <div class="tournament-champion">
        ${champion?`<div class="tournament-champion-inner">${headImg(champion,52,champion.name)}<strong>${esc(champion.name)}</strong><small>🏆 ${esc(kit.name)} Champion</small></div>`:`<div class="tournament-champion-inner"><strong>TBD</strong><small>Winner of the Final</small></div>`}
      </div>
    </div>
  </section>`);

  $('#bracketViewport').innerHTML=filled?`<div class="tournament-bracket">${roundHtml.join('')}</div>`:`<div class="tournament-empty"><div><b>No players seeded yet.</b>${isOwner()?'Use Owner Bracket Controls above to add the first player.':'The Owner has not seeded this bracket yet.'}</div></div>`;

  if(isOwner()){
    document.querySelectorAll('[data-advance-player]').forEach(btn=>btn.onclick=async()=>{
      const roundNo=Number(btn.dataset.advanceRound);
      const matchNo=Number(btn.dataset.advanceMatch);
      const pid=btn.dataset.advancePlayer;
      const a=participant(roundNo,matchNo,0,state),b=participant(roundNo,matchNo,1,state);
      if(String(pid)!==String(a)&&String(pid)!==String(b))return;
      let nextWinners=clearWinnerPath(state.winners,roundNo,matchNo,state.bracket_size);
      nextWinners[`${roundNo}-${matchNo}`]=pid;
      await saveState({...state,winners:nextWinners});
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
  }catch{accessRole='public'}
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
