
import { getSupabase } from './supabase-loader.js';

const STORAGE_KEY='nova-platform-filter';
const valid=new Set(['all','bedrock','java']);
let current=valid.has(localStorage.getItem(STORAGE_KEY))?localStorage.getItem(STORAGE_KEY):'all';
let allNames=[];

function platformOf(name){
  return String(name||'').trim().startsWith('.') ? 'bedrock' : 'java';
}
function matches(name){
  return current==='all' || platformOf(name)===current;
}
function setButtonState(){
  document.querySelectorAll('[data-platform-filter]').forEach(btn=>{
    const active=btn.dataset.platformFilter===current;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-pressed',active?'true':'false');
  });
}
function filteredCount(){
  if(!allNames.length)return null;
  if(current==='all')return allNames.length;
  return allNames.filter(n=>platformOf(n)===current).length;
}
function updatePlayerCount(){
  const el=document.querySelector('#playerCount');
  if(!el)return;
  const count=filteredCount();
  if(count!==null)el.textContent=String(count);
}
function applyOverall(){
  const rows=[...document.querySelectorAll('.ref-player-row')];
  if(!rows.length)return false;
  let visibleIndex=0;
  for(const row of rows){
    const name=row.querySelector('.ident strong')?.textContent.trim()||'';
    const show=matches(name);
    row.classList.toggle('v18-filter-hidden',!show);
    row.classList.remove('top1','top2','top3');
    if(show){
      visibleIndex++;
      if(visibleIndex<=3)row.classList.add(`top${visibleIndex}`);
      const place=row.querySelector('.rank-strip .place');
      if(place && place.textContent!==`${visibleIndex}.`)place.textContent=`${visibleIndex}.`;
    }
  }
  let empty=document.querySelector('.v18-overall-empty');
  if(visibleIndex===0){
    if(!empty){
      empty=document.createElement('div');
      empty.className='empty v18-overall-empty';
      document.querySelector('#content')?.appendChild(empty);
    }
    empty.textContent=current==='bedrock'?'No Bedrock players match this view.':current==='java'?'No Java players match this view.':'No players yet.';
  }else empty?.remove();
  return true;
}
function applyKitPage(){
  const columns=[...document.querySelectorAll('.kit-tier-column')];
  if(!columns.length)return false;
  for(const column of columns){
    const rows=[...column.querySelectorAll('.kit-tier-player')];
    for(const row of rows){
      const name=row.querySelector('.grow strong')?.textContent.trim() || row.querySelector('strong')?.textContent.trim() || '';
      row.classList.toggle('v18-filter-hidden',!matches(name));
    }
    const visible=rows.filter(r=>!r.classList.contains('v18-filter-hidden'));
    let placeholder=column.querySelector('.v18-filter-empty');
    const originalEmpty=column.querySelector('.kit-tier-empty:not(.v18-filter-empty)');
    if(rows.length && visible.length===0){
      if(originalEmpty)originalEmpty.classList.add('v18-filter-hidden');
      if(!placeholder){
        placeholder=document.createElement('div');
        placeholder.className='kit-tier-empty v18-filter-empty';
        column.querySelector('.kit-tier-list')?.appendChild(placeholder);
      }
      placeholder.textContent=current==='bedrock'?'No Bedrock players':current==='java'?'No Java players':'No players';
    }else{
      placeholder?.remove();
      if(originalEmpty)originalEmpty.classList.remove('v18-filter-hidden');
    }
  }
  return true;
}
function apply(){
  setButtonState();
  updatePlayerCount();
  applyOverall();
  applyKitPage();
}
function choose(next){
  if(!valid.has(next))return;
  current=next;
  localStorage.setItem(STORAGE_KEY,current);
  apply();
}
document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-platform-filter]');
  if(!btn)return;
  choose(btn.dataset.platformFilter);
});
let scheduled=false;
function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{
    scheduled=false;
    apply();
  });
}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
document.querySelector('#search')?.addEventListener('input',schedule);

async function loadCounts(){
  try{
    const supabase=await getSupabase();
    const {data,error}=await supabase.from('players').select('name');
    if(error)throw error;
    allNames=(data||[]).map(x=>x.name);
    updatePlayerCount();
  }catch(e){
    console.warn('Could not load platform filter counts',e);
  }
}
setButtonState();
loadCounts();
schedule();
