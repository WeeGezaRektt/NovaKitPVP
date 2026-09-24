
import { getSupabase } from './supabase-loader.js';

let supabase;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

getSupabase().then(s=>supabase=s).catch(()=>{});

function showToast(message){
  const t=$('#toast');
  if(!t)return;
  t.textContent=message;
  t.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>t.classList.add('hidden'),3200);
}

async function apiFetch(path,options={}){
  if(!supabase)supabase=await getSupabase();
  const {data:{session}}=await supabase.auth.getSession();
  const r=await fetch(path,{
    ...options,
    headers:{
      'Content-Type':'application/json',
      Authorization:`Bearer ${session?.access_token||''}`,
      ...(options.headers||{})
    }
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(body.error||`Request failed (${r.status})`);
  return body;
}

function enhanceTierEditor(){
  const body=$('#editorBody');
  if(!body)return;
  const rows=[...body.querySelectorAll('.tier-edit')];
  if(!rows.length)return;

  const holder=rows[0].parentElement;
  if(holder&&!holder.classList.contains('tier-editor-grid'))holder.classList.add('tier-editor-grid');

  rows.forEach(row=>{
    if(row.dataset.v15==='1')return;
    row.dataset.v15='1';
    row.classList.add('v15-tier-card');
    const selects=[...row.querySelectorAll('select')];
    const labels=['Current tier','Peak tier','Retired tier'];
    selects.forEach((select,i)=>{
      const wrapper=document.createElement('label');
      wrapper.className='tier-select-field';
      const span=document.createElement('span');
      span.textContent=labels[i]||'Tier';
      select.parentNode.insertBefore(wrapper,select);
      wrapper.append(span,select);
    });
  });
}

function logTitle(action){
  return ({
    PLAYER_CREATED:'Player added',
    PLAYER_UPDATED:'Player details changed',
    PLAYER_DELETED:'Player deleted',
    TIER_CREATED:'Tier entry created',
    TIER_UPDATED:'Tier changed',
    TIER_DELETED:'Tier entry removed',
    ADMIN_ACCOUNT_CREATED:'Staff account created',
    ADMIN_ACCOUNT_REMOVED:'Staff account removed',
    RESET_ALL_TIERS:'All tiers reset',
    FACTORY_RESET_TIERLIST:'Tierlist factory reset',
    AUDIT_LOG_CLEARED:'Audit log cleared'
  })[action] || action.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());
}
function val(v){return v==null||v===''?'none':String(v)}
function changeLine(label,before,after){
  if(val(before)===val(after))return '';
  return `<div class="friendly-log-line"><span class="log-label">${esc(label)}</span><span class="log-before">${esc(val(before))}</span><span>→</span><span class="log-after">${esc(val(after))}</span></div>`;
}
function buildSummary(action,data){
  const lines=[];
  if(action.startsWith('PLAYER_')){
    const before=data.before||{},after=data.after||{};
    const name=after.name||before.name;
    if(name)lines.push(`<div class="friendly-log-line"><span class="log-label">Player</span><b>${esc(name)}</b></div>`);
    if(action==='PLAYER_UPDATED'){
      lines.push(changeLine('Username',before.name,after.name));
      lines.push(changeLine('Region',before.region,after.region));
      if(before.avatar_url!==after.avatar_url)lines.push(`<div class="friendly-log-line"><span class="log-label">Avatar</span><span>changed</span></div>`);
    }
  }else if(action.startsWith('TIER_')){
    const before=data.before||{},after=data.after||{};
    if(data.player_name)lines.push(`<div class="friendly-log-line"><span class="log-label">Player</span><b>${esc(data.player_name)}</b></div>`);
    if(data.gamemode)lines.push(`<div class="friendly-log-line"><span class="log-label">Kit</span><b>${esc(data.gamemode)}</b></div>`);
    if(action==='TIER_UPDATED'){
      lines.push(changeLine('Current',before.active,after.active));
      lines.push(changeLine('Peak',before.peak,after.peak));
      lines.push(changeLine('Retired',before.retired,after.retired));
    }else{
      const row=action==='TIER_CREATED'?(data.after||{}):(data.before||{});
      if(row.active_tier)lines.push(`<div class="friendly-log-line"><span class="log-label">Current</span><b>${esc(row.active_tier)}</b></div>`);
      if(row.peak_tier)lines.push(`<div class="friendly-log-line"><span class="log-label">Peak</span><b>${esc(row.peak_tier)}</b></div>`);
      if(row.retired_tier)lines.push(`<div class="friendly-log-line"><span class="log-label">Retired</span><b>${esc(row.retired_tier)}</b></div>`);
    }
  }else if(action.includes('ADMIN_ACCOUNT')){
    if(data.username)lines.push(`<div class="friendly-log-line"><span class="log-label">Username</span><b>${esc(data.username)}</b></div>`);
    if(data.email)lines.push(`<div class="friendly-log-line"><span class="log-label">Email</span><b>${esc(data.email)}</b></div>`);
  }else if(action==='RESET_ALL_TIERS'){
    lines.push(`<div class="friendly-log-line"><span>Every player's current, peak and retired tiers were cleared. Player profiles were kept.</span></div>`);
  }else if(action==='FACTORY_RESET_TIERLIST'){
    lines.push(`<div class="friendly-log-line"><span>Every player profile and tier was deleted.</span></div>`);
  }else if(action==='AUDIT_LOG_CLEARED'){
    lines.push(`<div class="friendly-log-line"><span>The previous audit history was cleared.</span></div>`);
  }
  return lines.filter(Boolean).join('') || `<div class="friendly-log-line"><span>No extra details.</span></div>`;
}

function enhanceLogs(){
  const heading=[...document.querySelectorAll('#panel h2')].find(h=>h.textContent.trim()==='Audit Log');
  if(!heading)return;
  document.querySelectorAll('#panel .log').forEach(log=>{
    if(log.dataset.v15==='1')return;
    log.dataset.v15='1';

    const action=log.querySelector('.log-top strong')?.textContent.trim()||'EVENT';
    const time=log.querySelector('.log-top small')?.textContent.trim()||'';
    const actor=log.querySelector(':scope > .muted')?.textContent.trim()||'System';
    const pre=log.querySelector('pre');
    let data={};
    try{data=JSON.parse(pre?.textContent||'{}')}catch{}

    log.className='friendly-log';
    log.innerHTML=`
      <div class="friendly-log-head">
        <div>
          <div class="friendly-log-title">${esc(logTitle(action))}</div>
          <div class="friendly-log-actor">By <b>${esc(actor)}</b></div>
        </div>
        <div class="friendly-log-time">${esc(time)}</div>
      </div>
      <div class="friendly-log-summary">${buildSummary(action,data)}</div>
      <details>
        <summary>Technical details</summary>
        <pre>${esc(JSON.stringify(data,null,2))}</pre>
      </details>`;
  });
}

async function enhanceStaff(){
  const heading=[...document.querySelectorAll('#panel h2')].find(h=>h.textContent.trim()==='Staff Accounts');
  if(!heading)return;

  const emailInput=$('#newAdminEmail');
  if(emailInput&&!$('#newAdminUsername')){
    const field=document.createElement('div');
    field.className='field v15-username-field';
    field.innerHTML='<label>Staff username</label><input id="newAdminUsername" type="text" maxlength="32" placeholder="e.g. AbsurdFish">';
    emailInput.closest('.form-row')?.prepend(field);
  }

  if($('#panel').dataset.staffNamesLoaded==='1')return;
  $('#panel').dataset.staffNamesLoaded='1';
  try{
    const body=await apiFetch('/api/list-staff');
    const byEmail=new Map((body.users||[]).map(s=>[String(s.email||'').toLowerCase(),s]));
    document.querySelectorAll('.staff-card').forEach(card=>{
      const strong=card.querySelector('span:nth-child(2) > strong');
      if(!strong)return;
      const email=strong.textContent.trim().toLowerCase();
      const s=byEmail.get(email);
      if(!s)return;
      const parent=strong.parentElement;
      strong.className='staff-display-name';
      strong.textContent=s.username||s.email;
      if(!parent.querySelector('.staff-email-line')){
        const line=document.createElement('span');
        line.className='staff-email-line';
        line.textContent=s.email;
        strong.insertAdjacentElement('afterend',line);
      }
    });
  }catch(e){
    console.warn('Could not load staff display names',e);
  }
}

function enhanceSecurity(){
  const heading=[...document.querySelectorAll('#panel h2')].find(h=>h.textContent.trim()==='Security & Reset');
  if(!heading)return;
  const danger=$('#panel .danger-zone');
  if(danger&&!danger.querySelector('.reset-help')){
    const div=document.createElement('div');
    div.className='reset-help';
    div.innerHTML='<b>Reset All Tiers</b> keeps the player list and only clears current / peak / retired tiers. <b>Factory Reset</b> removes the whole tierlist.';
    danger.appendChild(div);
  }
}

async function createAdminWithUsername(btn){
  const username=$('#newAdminUsername')?.value.trim()||'';
  const email=$('#newAdminEmail')?.value.trim()||'';
  const password=$('#newAdminPassword')?.value||'';

  if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username)){
    showToast('Staff username must be 2-32 letters, numbers, dots, dashes or underscores.');
    return;
  }
  if(password.length<8){showToast('Temporary password must be at least 8 characters.');return;}

  btn.disabled=true;
  try{
    await apiFetch('/api/create-admin',{method:'POST',body:JSON.stringify({username,email,password})});
    showToast(`Admin ${username} created`);
    setTimeout(()=>document.querySelector('[data-tab="staff"]')?.click(),250);
  }catch(e){
    showToast(e.message||String(e));
  }finally{
    btn.disabled=false;
  }
}

document.addEventListener('click',async e=>{
  const btn=e.target.closest?.('#createAdmin');
  if(!btn||!$('#newAdminUsername'))return;
  e.preventDefault();
  e.stopImmediatePropagation();
  await createAdminWithUsername(btn);
},true);

function enhance(){
  enhanceTierEditor();
  enhanceLogs();
  enhanceStaff();
  enhanceSecurity();
}

new MutationObserver(()=>enhance()).observe(document.documentElement,{childList:true,subtree:true});
enhance();
