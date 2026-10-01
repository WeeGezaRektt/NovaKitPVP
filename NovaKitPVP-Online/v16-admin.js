import { getSupabase } from './supabase-loader.js';

let supabase;
const $ = s => document.querySelector(s);

getSupabase().then(s=>supabase=s).catch(()=>{});

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
    headers:{
      'Content-Type':'application/json',
      Authorization:`Bearer ${session?.access_token||''}`,
      ...(options.headers||{})
    }
  });

  const body=await r.json().catch(()=>({}));

  if(!r.ok){
    throw new Error(body.error||`Request failed (${r.status})`);
  }

  return body;
}

async function refreshStaffCards(){
  const heading=[...document.querySelectorAll('#panel h2')]
    .find(h=>h.textContent.trim()==='Staff Accounts');

  if(!heading)return;

  let staffBody;

  try{
    staffBody=await apiFetch('/api/list-staff');
  }catch(e){
    console.warn('list-staff failed',e);
    return;
  }

  const users=staffBody.users||[];
  const byId=new Map(users.map(u=>[String(u.id),u]));

  document.querySelectorAll('.staff-card').forEach(card=>{
    const reset=card.querySelector('[data-reset-password]');
    if(!reset)return;

    const userId=String(reset.dataset.resetPassword||'');
    const staff=byId.get(userId);
    if(!staff)return;

    const textHolder=card.querySelector('span:nth-child(2)');
    const strong=textHolder?.querySelector('strong');

    if(!textHolder||!strong)return;

    const username=String(staff.username||'').trim();
    const hasRealUsername=
      username &&
      username.toLowerCase()!==String(staff.email||'').toLowerCase();

    strong.classList.add('staff-display-name');
    strong.textContent=hasRealUsername ? username : staff.email;

    let emailLine=textHolder.querySelector('.staff-email-line');

    if(!emailLine){
      emailLine=document.createElement('span');
      emailLine.className='staff-email-line';
      strong.insertAdjacentElement('afterend',emailLine);
    }

    emailLine.textContent=staff.email||'';

    const actions=card.querySelector('.split-actions');
    if(!actions)return;

    // Remove the newer inline username editor if it exists.
    card.querySelector('.staff-username-inline')?.remove();

    let btn=actions.querySelector('[data-edit-staff-username]');

    if(!btn){
      btn=document.createElement('button');
      btn.className='btn small staff-username-edit';
      btn.textContent='Edit Username';
      btn.dataset.editStaffUsername=staff.id;

      actions.prepend(btn);
    }

    btn.dataset.currentUsername=hasRealUsername ? username : '';
    btn.dataset.email=staff.email||'';

    let linked=textHolder.querySelector('.linked-player-line.v204');

    if(staff.role==='tester' && staff.linked_player_name){
      if(!linked){
        linked=document.createElement('span');
        linked.className='linked-player-line v204';
        textHolder.appendChild(linked);
      }

      linked.textContent=`Linked tierlist player: ${staff.linked_player_name}`;
    }else if(linked){
      linked.remove();
    }
  });
}

async function editStaffUsername(btn){
  if(!supabase)supabase=await getSupabase();

  const current=btn.dataset.currentUsername||'';
  const email=btn.dataset.email||'this staff member';

  const username=prompt(
    `Set the staff username for ${email}:`,
    current
  );

  if(username===null)return;

  const clean=username.trim();

  if(!/^[A-Za-z0-9_.-]{2,32}$/.test(clean)){
    toast('Username must be 2-32 letters, numbers, dots, dashes or underscores.');
    return;
  }

  btn.disabled=true;

  try{
    const {error}=await supabase.rpc('owner_set_staff_username',{
      target_user_id:btn.dataset.editStaffUsername,
      new_username:clean
    });

    if(error)throw error;

    btn.dataset.currentUsername=clean;

    toast(`Staff username changed to ${clean}`);

    await refreshStaffCards();
  }catch(e){
    toast(e.message||String(e));
  }finally{
    btn.disabled=false;
  }
}

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-edit-staff-username]');

  if(!btn)return;

  e.preventDefault();
  e.stopImmediatePropagation();

  editStaffUsername(btn);
},true);

let timer;

function schedule(){
  clearTimeout(timer);
  timer=setTimeout(refreshStaffCards,80);
}

new MutationObserver(schedule).observe(document.documentElement,{
  childList:true,
  subtree:true
});

schedule();
