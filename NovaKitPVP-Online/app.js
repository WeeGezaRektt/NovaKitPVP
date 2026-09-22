import { getSupabase } from './supabase-loader.js';
import { GAMEMODES, ACTIVE_TIERS, POINTS, DEFAULT_ASSETS, totalPoints, rankFor, headImg, bodyImg, bindHeadFallbacks, iconMarkup, assetValue, esc, tierSortValue, scoreTier } from './site-config.js';

let supabase;
let players=[];
let assets={...DEFAULT_ASSETS};
let currentMode='overall';
const $=s=>document.querySelector(s);

const REGION_NAMES={EU:'Europe',NA:'North America',AS:'Asia',AU:'Australia',SA:'South America',ME:'Middle East'};
function region(r){return `<span class="region r-${esc(r)}">${esc(r)}</span>`}
function tierBadge(tier,type='active'){
  if(!tier||tier==='Unranked') return '';
  const label=type==='peak'?`P${tier}`:tier;
  return `<span class="tier ${label.toLowerCase()} ${type}">${esc(label)}</span>`;
}
function rowForMode(p,g){return (p.player_tiers||[]).find(t=>t.gamemode===g.id)}
function tierPoints(tier){return POINTS[tier]||0}
function countedTier(t){
  if(!t)return {tier:null,type:'active',points:0};
  const options=[];
  if(t.active_tier&&t.active_tier!=='Unranked')options.push({tier:t.active_tier,type:'active',points:tierPoints(t.active_tier)});
  if(t.peak_tier)options.push({tier:t.peak_tier,type:'peak',points:tierPoints(t.peak_tier)});
  if(t.retired_tier)options.push({tier:t.retired_tier,type:'retired',points:tierPoints(t.retired_tier)});
  return options.sort((a,b)=>b.points-a.points)[0]||{tier:null,type:'active',points:0};
}
function shownTier(t){
  if(!t)return null;
  if(t.active_tier&&t.active_tier!=='Unranked')return {tier:t.active_tier,type:'active',label:t.active_tier};
  if(t.retired_tier)return {tier:t.retired_tier,type:'retired',label:t.retired_tier};
  if(t.peak_tier)return {tier:t.peak_tier,type:'peak',label:`P${t.peak_tier}`};
  return null;
}
function overallTierToken(g,t){
  const shown=shownTier(t); if(!shown)return '';
  const counted=countedTier(t);
  const tip=`${g.name}: ${shown.label} · ${counted.points} pts counted${counted.tier&&counted.tier!==shown.tier?` from ${counted.type==='peak'?'peak ':''}${counted.tier}`:''}`;
  return `<span class="overall-tier-token ${shown.label.toLowerCase()} ${shown.type}" data-tier-tip="${esc(tip)}" aria-label="${esc(tip)}"><span class="overall-kit-circle">${modeIcon(g)}</span><b>${esc(shown.label)}</b></span>`;
}
function overallBadges(p){return GAMEMODES.map(g=>overallTierToken(g,rowForMode(p,g))).filter(Boolean).join('')||'<span class="muted">Unranked</span>'}
function sortedOverall(list=players){return [...list].sort((a,b)=>totalPoints(b)-totalPoints(a)||a.name.localeCompare(b.name))}
function modeIcon(g){return iconMarkup(assetValue(assets,g.assetKey),'asset-icon')}
function applyBrand(){const el=$('#brandMark');if(el)el.innerHTML=iconMarkup(assetValue(assets,'brand_logo'),'brand-icon')}
function rowsToAssets(rows){return {...DEFAULT_ASSETS,...Object.fromEntries((rows||[]).map(r=>[r.asset_key,r.asset_value]))}}

async function load(){
  try{
    supabase=await getSupabase();
    const [playersRes,assetsRes]=await Promise.all([
      supabase.from('players').select('id,name,region,avatar_url,minecraft_uuid,created_at,updated_at,player_tiers(id,gamemode,active_tier,peak_tier,retired_tier,updated_at)'),
      supabase.from('site_assets').select('asset_key,asset_value')
    ]);
    if(playersRes.error)throw playersRes.error;
    if(assetsRes.error)console.warn(assetsRes.error);
    players=playersRes.data||[];
    assets=rowsToAssets(assetsRes.data);
    applyBrand();renderNav();render();subscribe();
  }catch(e){console.error(e);$('#content').innerHTML=`<div class="empty"><b>NovaKitPVP is being configured.</b><br><br>${esc(e.message||e)}</div>`}
}
function subscribe(){
  try{
    supabase.channel('nova-public')
      .on('postgres_changes',{event:'*',schema:'public',table:'players'},()=>refreshPlayers())
      .on('postgres_changes',{event:'*',schema:'public',table:'player_tiers'},()=>refreshPlayers())
      .on('postgres_changes',{event:'*',schema:'public',table:'site_assets'},()=>refreshAssets())
      .subscribe();
  }catch{}
}
let refreshTimer;
function refreshPlayers(){clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{
  const {data}=await supabase.from('players').select('id,name,region,avatar_url,minecraft_uuid,created_at,updated_at,player_tiers(id,gamemode,active_tier,peak_tier,retired_tier,updated_at)');
  if(data){players=data;render()}
},250)}
async function refreshAssets(){const {data}=await supabase.from('site_assets').select('asset_key,asset_value');if(data){assets=rowsToAssets(data);applyBrand();renderNav();render()}}
function renderNav(){
  $('#gameNav').innerHTML=`<button class="game-link ${currentMode==='overall'?'active':''}" data-mode="overall"><span class="game-icon">⌂</span>Overall</button>`+GAMEMODES.map(g=>`<button class="game-link ${currentMode===g.id?'active':''}" data-mode="${g.id}"><span class="game-icon">${modeIcon(g)}</span>${esc(g.name)}</button>`).join('');
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{currentMode=b.dataset.mode;renderNav();render()})
}
function render(){
  $('#playerCount').textContent=players.length;
  if(currentMode==='overall') renderOverall(); else renderMode(GAMEMODES.find(g=>g.id===currentMode));
  bindHeadFallbacks();
}
function renderOverall(){
  $('#eyebrow').textContent='OVERALL LEADERBOARD';$('#title').textContent='NovaKitPVP Rankings';$('#subtitle').textContent='Competitive Minecraft rankings across 10 gamemodes.';
  const q=$('#search').value.trim().toLowerCase();
  const list=sortedOverall(players.filter(p=>!q||p.name.toLowerCase().includes(q)));
  $('#content').innerHTML=`<div class="leaderboard ref-leaderboard">${list.length?list.map((p,i)=>playerRow(p,i)).join(''):'<div class="empty">No players yet.</div>'}</div>`;
  bindProfiles();
}
function playerRow(p,i){
  const pts=totalPoints(p),rank=rankFor(pts,assets),place=i+1;
  return `<button class="player-row ref-player-row ${i<3?'top'+place:''}" data-player="${p.id}"><span class="rank-strip"><span class="place">${place}.</span><span class="body-render">${bodyImg(p,86,p.name)}</span></span><span class="ident"><span><strong>${esc(p.name)}</strong><span class="subline"><span class="rank-chip ref-rank"><i>${iconMarkup(rank.icon,'rank-icon')}</i>${esc(rank.name)} <em>(${pts} points)</em></span></span></span></span><span class="row-region">${region(p.region)}</span><span class="tiers ref-tiers">${overallBadges(p)}</span></button>`;
}
function renderMode(g){
  $('#eyebrow').textContent=`${g.name.toUpperCase()} RANKINGS`;$('#title').textContent=g.name;$('#subtitle').textContent=`Players ranked in ${g.name}.`;
  const q=$('#search').value.trim().toLowerCase();
  const ranked=players.filter(p=>{const t=rowForMode(p,g);return t&&t.active_tier&&t.active_tier!=='Unranked'}).filter(p=>!q||p.name.toLowerCase().includes(q));
  const groups=[];
  for(const tier of ACTIVE_TIERS.filter(t=>t!=='Unranked')){
    const group=ranked.filter(p=>rowForMode(p,g)?.active_tier===tier).sort((a,b)=>totalPoints(b)-totalPoints(a));
    if(group.length)groups.push({label:tier,type:'active',players:group});
  }
  $('#content').innerHTML=`<div class="mode-groups">${groups.length?groups.map(x=>`<section class="tier-group"><h3>${tierBadge(x.label,'active')} <span>${esc(x.label)}</span><span class="muted">${x.players.length} player${x.players.length===1?'':'s'}</span></h3><div class="tier-grid">${x.players.map(p=>modeCard(p,g)).join('')}</div></section>`).join(''):'<div class="empty">No active ranked players in this gamemode yet.</div>'}</div>`;
  bindProfiles();
}
function modeCard(p,g){const t=rowForMode(p,g);let badge=t.active_tier&&t.active_tier!=='Unranked'?tierBadge(t.active_tier):'';return `<button class="mode-card" data-player="${p.id}">${headImg(p,56,p.name)}<span class="grow"><strong>${esc(p.name)}</strong><small>${esc(rankFor(totalPoints(p),assets).name)} · ${totalPoints(p)} pts</small></span>${region(p.region)}${badge}</button>`}
function bindProfiles(){document.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>openProfile(players.find(p=>p.id===b.dataset.player)))}
function positionBadge(place){return `<span class="profile-position-badge ${place===1?'gold':place===2?'silver':place===3?'bronze':''}">${place||'—'}.</span>`}
function openProfile(p){
  if(!p)return;
  const pts=totalPoints(p),rank=rankFor(pts,assets),place=sortedOverall().findIndex(x=>x.id===p.id)+1;
  const tokens=GAMEMODES.map(g=>overallTierToken(g,rowForMode(p,g))).filter(Boolean).join('')||'<span class="muted">Unranked</span>';
  $('#profileBody').innerHTML=`<div class="ref-profile"><div class="profile-avatar-ring">${headImg(p,112,p.name)}</div><h2>${esc(p.name)}</h2><div class="profile-rank-pill"><span>${iconMarkup(rank.icon,'rank-icon')}</span>${esc(rank.name)}</div><div class="profile-region-name">${esc(REGION_NAMES[p.region]||p.region||'')}</div><section class="ref-profile-section"><h3>POSITION</h3><div class="profile-position-card">${positionBadge(place)}<strong>🏆 OVERALL <em>(${pts} points)</em></strong></div></section><section class="ref-profile-section"><h3>TIERS</h3><div class="profile-tier-token-box">${tokens}</div></section><section class="ref-profile-section"><h3>POINTS BY KIT</h3><div class="profile-breakdown">${GAMEMODES.map(g=>{const t=rowForMode(p,g)||{};const counted=countedTier(t);const active=t.active_tier&&t.active_tier!=='Unranked'?t.active_tier:'Unranked';return `<div class="profile-breakdown-row"><span><span class="inline-kit-icon">${modeIcon(g)}</span><b>${esc(g.name)}</b><small>Current ${esc(active)}${t.peak_tier?` · Peak ${esc(t.peak_tier)}`:''}</small></span><strong>${counted.points} pts</strong></div>`}).join('')}</div></section></div>`;
  $('#profileDialog').showModal();
  bindHeadFallbacks($('#profileDialog'));
}
$('#closeProfile').onclick=()=>$('#profileDialog').close();$('#profileDialog').onclick=e=>{if(e.target===$('#profileDialog'))$('#profileDialog').close()};$('#search').oninput=render;
load();
