export const DEFAULT_ASSETS = {
  brand_logo:'N',
  discord_url:'',
  kit_sword:'⚔', kit_mace:'◆', kit_vanilla:'✦', kit_spearmace:'➹', kit_diasmp:'◇',
  kit_nethpot:'◈', kit_diapot:'◉', kit_cart:'▣', kit_uhc:'❤', kit_nethsmp:'⬢',
  rank_grandmaster:'✹', rank_master:'◆', rank_ace:'✦', rank_specialist:'✧',
  rank_cadet:'◇', rank_novice:'◈', rank_rookie:'·'
};

export const GAMEMODES = [
  ['sword','Sword','kit_sword'],['mace','Mace','kit_mace'],['vanilla','Vanilla','kit_vanilla'],['spearmace','SpearMace','kit_spearmace'],['diasmp','DiaSMP','kit_diasmp'],
  ['nethpot','NethPot','kit_nethpot'],['diapot','DiaPot','kit_diapot'],['cart','Cart','kit_cart'],['uhc','UHC','kit_uhc'],['nethsmp','NethSMP','kit_nethsmp']
].map(([id,name,assetKey])=>({id,name,assetKey}));

export const RANKS = [
  {min:400,name:'Combat GrandMaster',assetKey:'rank_grandmaster'},
  {min:250,name:'Combat Master',assetKey:'rank_master'},
  {min:100,name:'Combat Ace',assetKey:'rank_ace'},
  {min:50,name:'Combat Specialist',assetKey:'rank_specialist'},
  {min:20,name:'Combat Cadet',assetKey:'rank_cadet'},
  {min:10,name:'Combat Novice',assetKey:'rank_novice'},
  {min:0,name:'Rookie',assetKey:'rank_rookie'}
];

export const POINTS = {HT1:60,LT1:45,HT2:30,LT2:20,HT3:10,LT3:6,HT4:4,LT4:3,HT5:2,LT5:1,Unranked:0,RHT1:60,RLT1:45,RHT2:30,RLT2:20};
export const ACTIVE_TIERS = ['HT1','LT1','HT2','LT2','HT3','LT3','HT4','LT4','HT5','LT5','Unranked'];
export const PEAK_TIERS = ['HT1','LT1','HT2','LT2','HT3','LT3','HT4','LT4','HT5','LT5'];
export const RETIRED_TIERS = ['RHT1','RLT1','RHT2','RLT2'];
export const REGIONS = ['EU','NA','AS','AU','SA','ME'];
export const OWNER_EMAILS = ['geraldmcbride60@gmail.com','poppymacedu@gmail.com'];

export function scoreTier(row){
  if(!row) return 0;
  const active=row.active_tier && row.active_tier!=='Unranked' ? (POINTS[row.active_tier]||0) : 0;
  const peak=row.peak_tier ? (POINTS[row.peak_tier]||0) : 0;
  const retired=row.retired_tier ? (POINTS[row.retired_tier]||0) : 0;
  // Overall points use the strongest tier the player has achieved in that kit.
  // Example: current HT2 + peak HT1 = 60 points from the HT1 peak.
  return Math.max(active,peak,retired);
}
export function totalPoints(player){ return (player.player_tiers||[]).reduce((s,t)=>s+scoreTier(t),0); }
export function rankFor(points,assets={}){
  const rank=RANKS.find(r=>points>=r.min)||RANKS[RANKS.length-1];
  return {...rank,icon:assetValue(assets,rank.assetKey)};
}
export function tierSortValue(tier){ const i=ACTIVE_TIERS.indexOf(tier); return i<0?999:i; }
export function assetValue(assets,key){return assets?.[key] || DEFAULT_ASSETS[key] || '';}
export function isImageIcon(value){return /^(https?:\/\/|data:image\/)/i.test(String(value||'').trim());}
export function iconMarkup(value,className='asset-icon'){
  value=String(value||'').trim();
  if(!value) return '';
  return isImageIcon(value)?`<img class="${esc(className)}" src="${esc(value)}" alt="">`:`<span class="${esc(className)}">${esc(value)}</span>`;
}

export function headUrls(player,size=64){
  const urls=[];
  if(player?.avatar_url) urls.push(player.avatar_url);
  const uuid=String(player?.minecraft_uuid||'').replace(/-/g,'');
  if(/^[0-9a-f]{32}$/i.test(uuid)) urls.push(`https://crafatar.com/avatars/${uuid}?size=${size}&overlay`);
  if(player?.name){
    urls.push(`https://mc-heads.net/avatar/${encodeURIComponent(player.name)}/${size}`);
    urls.push(`https://minotar.net/avatar/${encodeURIComponent(player.name)}/${size}.png`);
  }
  return [...new Set(urls.filter(Boolean))];
}
export function headUrl(player,size=64){return headUrls(player,size)[0]||'';}
export function headImg(player,size=64,alt=''){
  const urls=headUrls(player,size);
  const src=urls[0]||'';
  const fallbacks=JSON.stringify(urls.slice(1));
  return `<img src="${esc(src)}" data-head-fallbacks="${esc(fallbacks)}" alt="${esc(alt)}">`;
}

export function bodyUrls(player,size=96){
  const urls=[];
  if(player?.avatar_url) urls.push(player.avatar_url);
  const uuid=String(player?.minecraft_uuid||'').replace(/-/g,'');
  if(/^[0-9a-f]{32}$/i.test(uuid)){
    urls.push(`https://crafatar.com/renders/body/${uuid}?overlay&scale=4`);
  }
  if(player?.name){
    urls.push(`https://mc-heads.net/body/${encodeURIComponent(player.name)}/${size}`);
    urls.push(`https://mc-heads.net/player/${encodeURIComponent(player.name)}/${size}`);
  }
  return [...new Set(urls.filter(Boolean))];
}
export function bodyImg(player,size=96,alt=''){
  const urls=bodyUrls(player,size);
  const src=urls[0]||'';
  const fallbacks=JSON.stringify(urls.slice(1));
  return `<img src="${esc(src)}" data-head-fallbacks="${esc(fallbacks)}" alt="${esc(alt)}">`;
}

export function bindHeadFallbacks(root=document){
  root.querySelectorAll?.('img[data-head-fallbacks]').forEach(img=>{
    if(img.dataset.headBound==='1')return;
    img.dataset.headBound='1';
    let queue=[];
    try{queue=JSON.parse(img.dataset.headFallbacks||'[]')}catch{}
    img.onerror=()=>{
      const next=queue.shift();
      if(next){img.src=next;img.dataset.headFallbacks=JSON.stringify(queue)}else img.onerror=null;
    };
  });
}
export function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
export function fmtDate(value){try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return value||'';}}
