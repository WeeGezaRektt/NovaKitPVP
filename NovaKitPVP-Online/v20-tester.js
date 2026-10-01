import { getSupabase } from './supabase-loader.js';

let supabase;
let testerMode=false;
let testerContext={linked_player_id:null,linked_player_name:null};

const $=s=>document.querySelector(s);
const ALLOWED=['LT5','HT5','LT4','HT4','LT3'];
const STAFF_ONLY=new Set(['HT3','LT2','HT2','LT1','HT1']);

getSupabase().then(async s=>{
  supabase=s;
  await detectTester();
  enhance();
}).catch(console.error);

function toast(message){
  const t=$('#toast');
  if(!t)return;
  t.textContent=message;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>t.classList.add('hidden'),3000);
}

async function apiFetch(path,options={}){
  if(!supabase)supabase=await getSupabase();
  const {data:{session}}=await supabase.auth.getSession();
  const r=await fetch(path,{
    ...options,
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`,...(options.headers||{})}
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(body.error||`Request failed (${r.status})`);
  return body;
}

async function detectTester(){
  const {data:isTester,error}=await supabase.rpc('is_tester');
  if(error){console.warn(error);return}
  testerMode=Boolean(isTester);
  if(!testerMode)return;

  document.body.classList.add('tester-mode');
  const {data}=await supabase.rpc('get_my_tester_context');
  const row=Array.isArray(data)?data[0]:data;
  testerContext=row||testerContext;

  const repaint=()=>{
    const identity=$('#identity');
    if(identity){
      const small=identity.querySelector('small');
      if(small)small.textContent=`Tester · linked to ${testerContext.linked_player_name||'no player'}`;
    }
    const permission=$('#permission');
    if(permission){
      permission.className='notice permission';
      permission.innerHTML=`<b>Tester access</b> — search players and assign <b>LT5 → HT5 → LT4 → HT4 → LT3</b>. You cannot edit your own tiers, profile details, Peak/Retired, or any tier already above LT3.`;
    }
  };
  repaint();setTimeout(repaint,100);setTimeout(repaint,500);
}

async function findPlayerByEditor(){
  const name=$('#editName')?.value.trim();
  if(!name)return null;
  const {data,error}=await supabase.from('players').select('id,name').eq('name',name).limit(1);
  if(error)throw error;
  return data?.[0]||null;
}

function setAllowedOptions(select,current){
  select.dataset.original=current||'Unranked';
  select.innerHTML='';

  if(current==='Unranked'||!current){
    const p=document.createElement('option');p.value='';p.textContent='Choose tested tier…';p.selected=true;select.appendChild(p);
    for(const tier of ALLOWED){const o=document.createElement('option');o.value=tier;o.textContent=tier;select.appendChild(o)}
    return;
  }

  if(ALLOWED.includes(current)){
    for(const tier of ALLOWED){const o=document.createElement('option');o.value=tier;o.textContent=tier;o.selected=tier===current;select.appendChild(o)}
    return;
  }

  const o=document.createElement('option');o.value=current;o.textContent=`${current} — Staff only`;o.selected=true;select.appendChild(o);select.disabled=true;
}

async function enhanceTesterEditor(){
  if(!testerMode)return;
  const body=$('#editorBody');
  const save=$('#savePlayer');
  if(!body||!save||save.dataset.testerBound==='1')return;

  const player=await findPlayerByEditor().catch(()=>null);
  if(!player)return;

  save.dataset.testerBound='1';
  for(const id of ['editName','editRegion','editAvatar']){const el=$('#'+id);if(el)el.disabled=true}
  body.querySelector('.profile-note')?.remove();
  $('#deletePlayer')?.remove();

  const own=player.id===testerContext.linked_player_id;
  const intro=document.createElement('div');
  intro.className='tester-note';
  intro.innerHTML=own
    ? `<b>This is your linked player.</b> Testers cannot change their own tiers. An Admin or Owner must do it.`
    : `<b>Tester mode.</b> You can only change Current Tier between LT5 and LT3. Peak/Retired stay protected.`;
  body.prepend(intro);

  body.querySelectorAll('.tier-edit').forEach(row=>{
    row.classList.add('tester-tier-card');
    const active=row.querySelector('[data-kind="active"]');
    const peak=row.querySelector('[data-kind="peak"]');
    const retired=row.querySelector('[data-kind="retired"]');
    const current=active?.value||'Unranked';

    if(active)setAllowedOptions(active,current);
    if(peak){const wrap=peak.closest('.tier-select-field');if(wrap)wrap.dataset.kind='peak';else peak.style.display='none'}
    if(retired){const wrap=retired.closest('.tier-select-field');if(wrap)wrap.dataset.kind='retired';else retired.style.display='none'}

    if(own){row.classList.add('tester-locked');if(active)active.disabled=true}
    else if(STAFF_ONLY.has(current)){row.classList.add('staff-only','tester-locked');if(active)active.disabled=true}
  });

  if(own){save.disabled=true;save.textContent='Own tiers are Staff-only';return}

  save.textContent='Save Tested Tiers';
  save.onclick=async e=>{
    e?.preventDefault?.();
    const err=$('#editorError');if(err)err.textContent='';
    const changes=[];
    body.querySelectorAll('.tier-edit').forEach(row=>{
      const active=row.querySelector('[data-kind="active"]');
      if(!active||active.disabled)return;
      const next=active.value;
      const before=active.dataset.original||'Unranked';
      if(next&&next!==before)changes.push({gamemode:row.dataset.mode,tier:next});
    });

    if(!changes.length){toast('No tester tier changes selected.');return}
    save.disabled=true;
    try{
      for(const change of changes){
        const {error}=await supabase.rpc('tester_set_tier',{
          target_player_id:player.id,
          target_gamemode:change.gamemode,
          new_tier:change.tier
        });
        if(error)throw error;
      }
      toast(`Saved ${changes.length} tested tier${changes.length===1?'':'s'}`);
      $('#editorDialog')?.close();
      setTimeout(()=>location.reload(),350);
    }catch(e){if(err)err.textContent=e.message||String(e);save.disabled=false}
  };
}

async function enhanceOwnerStaff(){
  if(testerMode)return;
  const heading=[...document.querySelectorAll('#panel h2')].find(h=>h.textContent.trim()==='Staff Accounts');
  if(!heading)return;

  const emailInput=$('#newAdminEmail');
  if(!emailInput)return;

  const username=$('#newAdminUsername');
  if(username)username.id='newStaffUsername';

  if(!$('#newStaffRole')){
    const row=emailInput.closest('.form-row');
    const field=document.createElement('div');
    field.className='field new-staff-role-wrap';
    field.innerHTML='<label>Account type</label><select id="newStaffRole"><option value="admin">Admin</option><option value="tester">Tester</option></select>';
    row?.appendChild(field);
  }

  const card=emailInput.closest('.inner-card');
  const h3=card?.querySelector('h3');if(h3)h3.textContent='Create Staff Account';
  const createBtn=$('#createAdmin');if(createBtn)createBtn.textContent='Create Staff Account';

  let body;try{body=await apiFetch('/api/list-staff')}catch{return}
  const users=body.users||[];
  const byId=new Map(users.map(u=>[String(u.id),u]));

  document.querySelectorAll('.staff-card').forEach(card=>{
    const reset=card.querySelector('[data-reset-password]');if(!reset)return;
    const staff=byId.get(String(reset.dataset.resetPassword));if(!staff)return;

    const small=card.querySelector('span:nth-child(2) small');
    if(small){const roleLabel=staff.role==='owner'?'Owner':staff.role==='tester'?'Tester':'Admin';small.textContent=`${roleLabel} · ${staff.confirmed?'Confirmed':'Unconfirmed'} · created ${new Date(staff.created_at).toLocaleString()}`}

    const nameHolder=card.querySelector('span:nth-child(2)');
    if(staff.role==='tester'&&staff.linked_player_name&&!nameHolder?.querySelector('.linked-player-line')){
      const line=document.createElement('span');line.className='linked-player-line';line.textContent=`Linked tierlist player: ${staff.linked_player_name}`;nameHolder?.appendChild(line)
    }

    if(staff.role==='owner')return;
    const actions=card.querySelector('.split-actions');if(!actions||actions.querySelector('[data-staff-role]'))return;
    const wrap=document.createElement('div');wrap.className='staff-role-controls';
    wrap.innerHTML=`<select class="staff-role-select" data-staff-role="${staff.id}"><option value="admin" ${staff.role==='admin'?'selected':''}>Admin</option><option value="tester" ${staff.role==='tester'?'selected':''}>Tester</option></select><button class="btn small" data-save-staff-role="${staff.id}">Save Role</button>`;
    actions.prepend(wrap);
  });
}

document.addEventListener('click',async e=>{
  const create=e.target.closest?.('#createAdmin');
  if(create&&$('#newStaffUsername')){
    e.preventDefault();e.stopImmediatePropagation();
    const username=$('#newStaffUsername')?.value.trim()||'';
    const email=$('#newAdminEmail')?.value.trim()||'';
    const password=$('#newAdminPassword')?.value||'';
    const role=$('#newStaffRole')?.value||'admin';

    if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username)){toast('Staff username must be 2-32 letters, numbers, dots, dashes or underscores.');return}
    if(password.length<8){toast('Temporary password must be at least 8 characters.');return}

    create.disabled=true;
    try{
      await apiFetch('/api/create-admin',{method:'POST',body:JSON.stringify({username,email,password,role})});
      toast(`${role==='tester'?'Tester':'Admin'} ${username} created`);
      setTimeout(()=>document.querySelector('[data-tab="staff"]')?.click(),250);
    }catch(err){toast(err.message||String(err))}finally{create.disabled=false}
    return;
  }

  const saveRole=e.target.closest?.('[data-save-staff-role]');
  if(saveRole){
    e.preventDefault();
    const id=saveRole.dataset.saveStaffRole;
    const select=document.querySelector(`[data-staff-role="${CSS.escape(id)}"]`);if(!select)return;
    saveRole.disabled=true;
    try{
      const {error}=await supabase.rpc('owner_set_staff_role',{target_user_id:id,new_role:select.value});
      if(error)throw error;
      toast(`Staff role changed to ${select.value==='tester'?'Tester':'Admin'}`);
      setTimeout(()=>document.querySelector('[data-tab="staff"]')?.click(),250);
    }catch(err){toast(err.message||String(err))}finally{saveRole.disabled=false}
  }
},true);

let timer;
function enhance(){
  clearTimeout(timer);
  timer=setTimeout(async()=>{
    if(testerMode){
      await enhanceTesterEditor();
      const h2=[...document.querySelectorAll('#panel h2')].find(h=>h.textContent.trim()==='Players');
      if(h2){const sub=h2.parentElement?.querySelector('.muted');if(sub)sub.textContent='Search a player to enter a tested tier · your own profile is locked'}
    }else await enhanceOwnerStaff();
  },40);
}
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
enhance();
