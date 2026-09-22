export const GAMEMODES = [
  ['sword','Sword','⚔'],['mace','Mace','◆'],['vanilla','Vanilla','✦'],['spearmace','SpearMace','➹'],['diasmp','DiaSMP','◇'],
  ['nethpot','NethPot','◈'],['diapot','DiaPot','◉'],['cart','Cart','▣'],['uhc','UHC','❤'],['nethsmp','NethSMP','⬢']
].map(([id,name,icon])=>({id,name,icon}));

export const POINTS = {HT1:60,LT1:45,HT2:30,LT2:20,HT3:10,LT3:6,HT4:4,LT4:3,HT5:2,LT5:1,Unranked:0,RHT1:60,RLT1:45,RHT2:30,RLT2:20};
export const ACTIVE_TIERS = ['HT1','LT1','HT2','LT2','HT3','LT3','HT4','LT4','HT5','LT5','Unranked'];
export const PEAK_TIERS = ['HT1','LT1','HT2','LT2','HT3','LT3','HT4','LT4','HT5','LT5'];
export const RETIRED_TIERS = ['RHT1','RLT1','RHT2','RLT2'];
export const REGIONS = ['EU','NA','AS','AU','SA','ME'];
export const OWNER_NAMES = ['WeeGezaRektt','PoppyMacedU'];

export function scoreTier(row){
  if(!row) return 0;
  if(row.active_tier && row.active_tier !== 'Unranked') return POINTS[row.active_tier] || 0;
  if(row.retired_tier) return POINTS[row.retired_tier] || 0;
  if(row.peak_tier) return POINTS[row.peak_tier] || 0;
  return 0;
}
export function totalPoints(player){ return (player.player_tiers||[]).reduce((s,t)=>s+scoreTier(t),0); }
export function rankFor(points){
  if(points>=400)return {name:'Grandmaster',icon:'✹'};
  if(points>=250)return {name:'Master',icon:'◆'};
  if(points>=100)return {name:'Ace',icon:'✦'};
  if(points>=50)return {name:'Specialist',icon:'✧'};
  if(points>=20)return {name:'Cadet',icon:'◇'};
  if(points>=10)return {name:'Novice',icon:'◈'};
  return {name:'Rookie',icon:'·'};
}
export function tierSortValue(tier){ const i=ACTIVE_TIERS.indexOf(tier); return i<0?999:i; }
export function headUrl(player,size=64){
  if(player.avatar_url) return player.avatar_url;
  return `https://mc-heads.net/avatar/${encodeURIComponent(player.name)}/${size}`;
}
export function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
export function fmtDate(value){try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return value||'';}}
