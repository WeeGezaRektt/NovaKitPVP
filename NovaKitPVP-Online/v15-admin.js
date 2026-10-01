import { getSupabase } from './supabase-loader.js';

let supabase;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

getSupabase().then(s=>supabase=s).catch(()=>{});

function enhanceTierEditor(){
  const body=$('#editorBody');
  if(!body)return;

  const rows=[...body.querySelectorAll('.tier-edit')];
  if(!rows.length)return;

  const holder=rows[0].parentElement;
  if(holder&&!holder.classList.contains('tier-editor-grid')){
    holder.classList.add('tier-editor-grid');
  }

  rows.forEach(row=>{
    if(row.dataset.v15==='1')return;
    row.dataset.v15='1';
    row.classList.add('v15-tier-card');

    const selects=[...row.querySelectorAll('select')];
    const labels=['Current tier','Peak tier','Retired tier'];

    selects.forEach((select,i)=>{
      if(select.closest('.tier-select-field'))return;

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
    ADMIN_ACCOUNT_USERNAME_UPDATED:'Staff username changed',
    STAFF_ROLE_UPDATED:'Staff role changed',
    STAFF_PASSWORD_RESET:'Staff password reset',
    RESET_ALL_TIERS:'All tiers reset',
    FACTORY_RESET_TIERLIST:'Tierlist factory reset',
    AUDIT_LOG_CLEARED:'Audit log cleared'
  })[action] || String(action||'Event').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());
}

function val(v){
  return v==null||v===''?'none':String(v);
}

function changeLine(label,before,after){
  if(val(before)===val(after))return '';
  return `<div class="friendly-log-line"><span class="log-label">${esc(label)}</span><span class="log-before">${esc(val(before))}</span><span>→</span><span class="log-after">${esc(val(after))}</span></div>`;
}

function buildSummary(action,data){
  const lines=[];

  if(action.startsWith('PLAYER_')){
    const before=data.before||{},after=data.after||{};
    const name=after.name||before.name;

    if(name){
      lines.push(`<div class="friendly-log-line"><span class="log-label">Player</span><b>${esc(name)}</b></div>`);
    }

    if(action==='PLAYER_UPDATED'){
      lines.push(changeLine('Username',before.name,after.name));
      lines.push(changeLine('Region',before.region,after.region));
      if(before.avatar_url!==after.avatar_url){
        lines.push(`<div class="friendly-log-line"><span class="log-label">Avatar</span><span>changed</span></div>`);
      }
    }
  }else if(action.startsWith('TIER_')){
    const before=data.before||{},after=data.after||{};

    if(data.player_name){
      lines.push(`<div class="friendly-log-line"><span class="log-label">Player</span><b>${esc(data.player_name)}</b></div>`);
    }
    if(data.gamemode){
      lines.push(`<div class="friendly-log-line"><span class="log-label">Kit</span><b>${esc(data.gamemode)}</b></div>`);
    }

    if(action==='TIER_UPDATED'){
      lines.push(changeLine('Current',before.active,after.active));
      lines.push(changeLine('Peak',before.peak,after.peak));
      lines.push(changeLine('Retired',before.retired,after.retired));
    }
  }else if(action==='STAFF_ROLE_UPDATED'){
    if(data.email){
      lines.push(`<div class="friendly-log-line"><span class="log-label">Account</span><b>${esc(data.email)}</b></div>`);
    }
    if(data.role){
      lines.push(`<div class="friendly-log-line"><span class="log-label">Role</span><b>${esc(data.role)}</b></div>`);
    }
  }else if(action.includes('ADMIN_ACCOUNT')){
    if(data.username){
      lines.push(`<div class="friendly-log-line"><span class="log-label">Username</span><b>${esc(data.username)}</b></div>`);
    }
    if(data.email){
      lines.push(`<div class="friendly-log-line"><span class="log-label">Email</span><b>${esc(data.email)}</b></div>`);
    }
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
  const heading=[...document.querySelectorAll('#panel h2')]
    .find(h=>h.textContent.trim()==='Audit Log');

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

function enhanceStaff(){
  const heading=[...document.querySelectorAll('#panel h2')]
    .find(h=>h.textContent.trim()==='Staff Accounts');

  if(!heading)return;

  const emailInput=$('#newAdminEmail');

  /*
    IMPORTANT V20.1 FIX:
    v20-tester.js renames #newAdminUsername -> #newStaffUsername.
    The old V15 code only checked for #newAdminUsername, so it thought the
    field had vanished and created another one every MutationObserver pass.
  */
  if(
    emailInput &&
    !$('#newAdminUsername') &&
    !$('#newStaffUsername')
  ){
    const field=document.createElement('div');
    field.className='field v15-username-field';
    field.innerHTML='<label>Staff username</label><input id="newAdminUsername" type="text" maxlength="32" placeholder="e.g. AbsurdFish">';
    emailInput.closest('.form-row')?.prepend(field);
  }
}

function enhanceSecurity(){
  const heading=[...document.querySelectorAll('#panel h2')]
    .find(h=>h.textContent.trim()==='Security & Reset');

  if(!heading)return;

  const danger=$('#panel .danger-zone');
  if(danger&&!danger.querySelector('.reset-help')){
    const div=document.createElement('div');
    div.className='reset-help';
    div.innerHTML='<b>Reset All Tiers</b> keeps the player list and only clears current / peak / retired tiers. <b>Factory Reset</b> removes the whole tierlist.';
    danger.appendChild(div);
  }
}

function enhance(){
  enhanceTierEditor();
  enhanceLogs();
  enhanceStaff();
  enhanceSecurity();
}

let scheduled=false;
function scheduleEnhance(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{
    scheduled=false;
    enhance();
  });
}

new MutationObserver(scheduleEnhance).observe(document.documentElement,{
  childList:true,
  subtree:true
});

enhance();
