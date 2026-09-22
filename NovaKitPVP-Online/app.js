import { getSupabase } from './supabase-loader.js';
import { GAMEMODES, ACTIVE_TIERS, DEFAULT_ASSETS, totalPoints, rankFor, headImg, bindHeadFallbacks, iconMarkup, assetValue, esc, tierSortValue } from './site-config.js';

let supabase;
let players=[];
let assets={...DEFAULT_ASSETS};
let currentMode='overall';
const $=s=>document.querySelector(s);

function region(r){return `<span class="region r-${esc(r)}">${esc(r)}</span>`}
function tierBadge(tier,type='active'){
  if(!tier||tier==='Unranked') return '';
  const label=type==='peak'?`P${tier}`:tier;
  return `<span class="tier ${label.toLowerCase()} ${type}">${esc(label)}</span>`;
}
function rowForMode(p,g){return (p.player_tiers||[]).find(t=>t.gamemode===g.id)}
function overallBadges(p){return GAMEMODES.map(g=>{const t=rowForMode(p,g);if(!t)return'';if(t.active_tier&&t.active_tier!=='Unranked')return tierBadge(t.active_tier);if(t.retired_tier)return tierBadge(t.retired_tier,'retired');if(t.peak_tier)return tierBadge(t.peak_tier,'peak');return''}).filter(Boolean).join('')||'<span class="muted">Unranked</span>'}
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
  $('#content').innerHTML=`<div class="leader-head"><span>#</span><span>Player</span><span>Region</span><span>Tiers</span><span>Points</span></div><div class="leaderboard">${list.length?list.map((p,i)=>playerRow(p,i)).join(''):'<div class="empty">No players yet.</div>'}</div>`;
  bindProfiles();
}
function playerRow(p,i){const pts=totalPoints(p),rank=rankFor(pts,assets);return `<button class="player-row ${i<3?'top'+(i+1):''}" data-player="${p.id}"><span class="place">${i+1}</span><span class="ident">${headImg(p,64,p.name)}<span><strong>${esc(p.name)}</strong><span class="subline"><span class="rank-chip"><i>${iconMarkup(rank.icon,'rank-icon')}</i>${esc(rank.name)}</span></span></span></span><span>${region(p.region)}</span><span class="tiers">${overallBadges(p)}</span><span class="points"><strong>${pts}</strong><small>POINTS</small></span></button>`}
function renderMode(g){
  $('#eyebrow').textContent=`${g.name.toUpperCase()} RANKINGS`;$('#title').textContent=g.name;$('#subtitle').textContent=`Players ranked in ${g.name}.`;
  const q=$('#search').value.trim().toLowerCase();
  const ranked=players.filter(p=>{const t=rowForMode(p,g);return t&&(t.active_tier!=='Unranked'||t.retired_tier||t.peak_tier)}).filter(p=>!q||p.name.toLowerCase().includes(q));
  const groups=[];
  for(const tier of ACTIVE_TIERS.filter(t=>t!=='Unranked')){
    const group=ranked.filter(p=>rowForMode(p,g)?.active_tier===tier).sort((a,b)=>totalPoints(b)-totalPoints(a));
    if(group.length)groups.push({label:tier,type:'active',players:group});
  }
  const retired=ranked.filter(p=>{const t=rowForMode(p,g);return (!t.active_tier||t.active_tier==='Unranked')&&t.retired_tier}).sort((a,b)=>{const aa=rowForMode(a,g).retired_tier.replace(/^R/,'');const bb=rowForMode(b,g).retired_tier.replace(/^R/,'');return tierSortValue(aa)-tierSortValue(bb)});
  const peak=ranked.filter(p=>{const t=rowForMode(p,g);return (!t.active_tier||t.active_tier==='Unranked')&&!t.retired_tier&&t.peak_tier}).sort((a,b)=>tierSortValue(rowForMode(a,g).peak_tier)-tierSortValue(rowForMode(b,g).peak_tier));
  if(retired.length)groups.push({label:'Retired',type:'retired',players:retired});if(peak.length)groups.push({label:'Peak only',type:'peak',players:peak});
  $('#content').innerHTML=`<div class="mode-groups">${groups.length?groups.map(x=>`<section class="tier-group"><h3>${tierBadge(x.type==='active'?x.label:(x.players[0]&&rowForMode(x.players[0],g)?.[x.type==='retired'?'retired_tier':'peak_tier']),x.type)} <span>${esc(x.label)}</span><span class="muted">${x.players.length} player${x.players.length===1?'':'s'}</span></h3><div class="tier-grid">${x.players.map(p=>modeCard(p,g)).join('')}</div></section>`).join(''):'<div class="empty">No ranked players in this gamemode yet.</div>'}</div>`;
  bindProfiles();
}
function modeCard(p,g){const t=rowForMode(p,g);let badge=t.active_tier!=='Unranked'?tierBadge(t.active_tier):t.retired_tier?tierBadge(t.retired_tier,'retired'):tierBadge(t.peak_tier,'peak');return `<button class="mode-card" data-player="${p.id}">${headImg(p,56,p.name)}<span class="grow"><strong>${esc(p.name)}</strong><small>${esc(rankFor(totalPoints(p),assets).name)} · ${totalPoints(p)} pts</small></span>${region(p.region)}${badge}</button>`}
function bindProfiles(){document.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>openProfile(players.find(p=>p.id===b.dataset.player)))}
function openProfile(p){if(!p)return;const pts=totalPoints(p),rank=rankFor(pts,assets),place=sortedOverall().findIndex(x=>x.id===p.id)+1;$('#profileBody').innerHTML=`<div class="profile-hero">${headImg(p,96,p.name)}<div><div class="eyebrow">#${place||'—'} OVERALL</div><h2>${esc(p.name)}</h2><div class="subline">${region(p.region)} <span class="rank-chip"><i>${iconMarkup(rank.icon,'rank-icon')}</i>${esc(rank.name)}</span></div></div><div class="profile-score"><strong>${pts}</strong><span>POINTS</span></div></div><div class="profile-grid">${GAMEMODES.map(g=>{const t=rowForMode(p,g)||{};return `<div class="profile-mode"><div class="profile-mode-top"><strong><span class="inline-kit-icon">${modeIcon(g)}</span> ${esc(g.name)}</strong>${t.active_tier&&t.active_tier!=='Unranked'?tierBadge(t.active_tier):'<span class="muted">Unranked</span>'}</div><div class="history">${t.peak_tier?`<span>Peak ${tierBadge(t.peak_tier,'peak')}</span>`:''}${t.retired_tier?`<span>Retired ${tierBadge(t.retired_tier,'retired')}</span>`:''}${!t.peak_tier&&!t.retired_tier?'<span>No tier history</span>':''}</div></div>`}).join('')}</div>`;$('#profileDialog').showModal();bindHeadFallbacks($('#profileDialog'))}
$('#closeProfile').onclick=()=>$('#profileDialog').close();$('#profileDialog').onclick=e=>{if(e.target===$('#profileDialog'))$('#profileDialog').close()};$('#search').oninput=render;
load();
