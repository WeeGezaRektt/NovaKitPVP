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
  toast.timer=setTimeout(()=>t.classList.add('hidden'),3200);
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

function cardEmail(card){
  const line=card.querySelector('.staff-email-line');
  if(line?.textContent.trim()) return line.textContent.trim();

  const strong=card.querySelector('span:nth-child(2) > strong');
  const text=strong?.textContent.trim()||'';
  if(text.includes('@')) return text;

  const small=card.querySelector('span:nth-child(2) > small');
  const possible=small?.previousSibling?.textContent?.trim()||'';
  return possible.includes('@') ? possible : '';
}

function ensureEditButtons(){
  const heading=[...document.querySelectorAll('#panel h2')]
    .find(h=>h.textContent.trim()==='Staff Accounts');
  if(!heading)return;

  document.querySelectorAll('.staff-card').forEach(card=>{
    const reset=card.querySelector('[data-reset-password]');
    const actions=card.querySelector('.split-actions');
    if(!reset||!actions)return;

    const userId=String(reset.dataset.resetPassword||'');
    if(!userId)return;

    let btn=actions.querySelector('[data-edit-staff-username]');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.className='btn small staff-username-edit';
      btn.textContent='Edit Username';
      btn.dataset.editStaffUsername=userId;
      actions.prepend(btn);
    }

    if(!btn.dataset.email){
      btn.dataset.email=cardEmail(card);
    }
  });
}

async function refreshStaffDetails(){
  ensureEditButtons();

  let body;
  try{
    body=await apiFetch('/api/list-staff');
  }catch(e){
    // IMPORTANT: do not remove/hide Edit Username if the API fails.
    console.warn('Could not load staff details',e);
    return;
  }

  const users=body.users||[];
  const byId=new Map(users.map(u=>[String(u.id),u]));

  document.querySelectorAll('.staff-card').forEach(card=>{
    const reset=card.querySelector('[data-reset-password]');
    if(!reset)return;

    const staff=byId.get(String(reset.dataset.resetPassword||''));
    if(!staff)return;

    const holder=card.querySelector('span:nth-child(2)');
    const strong=holder?.querySelector('strong');
    if(!holder||!strong)return;

    const username=String(staff.username||'').trim();
    const email=String(staff.email||'').trim();
    const realUsername=username && username.toLowerCase()!==email.toLowerCase();

    if(realUsername){
      strong.textContent=username;
      let emailLine=holder.querySelector('.staff-email-line');
      if(!emailLine){
        emailLine=document.createElement('span');
        emailLine.className='staff-email-line';
        strong.insertAdjacentElement('afterend',emailLine);
      }
      emailLine.textContent=email;
    }

    const btn=card.querySelector('[data-edit-staff-username]');
    if(btn){
      btn.dataset.currentUsername=realUsername?username:'';
      btn.dataset.email=email;
    }

    let linked=holder.querySelector('.linked-player-line.v205');
    if(staff.role==='tester' && staff.linked_player_name){
      if(!linked){
        linked=document.createElement('span');
        linked.className='linked-player-line v205';
        holder.appendChild(linked);
      }
      linked.textContent=`Linked tierlist player: ${staff.linked_player_name}`;
    }else if(linked){
      linked.remove();
    }
  });
}

async function editUsername(btn){
  if(!supabase)supabase=await getSupabase();

  const email=btn.dataset.email||'this staff account';
  const current=btn.dataset.currentUsername||'';

  const value=prompt(`Set the staff username for ${email}:`,current);
  if(value===null)return;

  const username=value.trim();

  if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username)){
    toast('Username must be 2-32 letters, numbers, dots, dashes or underscores.');
    return;
  }

  btn.disabled=true;
  try{
    const {error}=await supabase.rpc('owner_set_staff_username',{
      target_user_id:btn.dataset.editStaffUsername,
      new_username:username
    });
    if(error)throw error;

    btn.dataset.currentUsername=username;
    toast(`Staff username changed to ${username}`);
    await refreshStaffDetails();
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
  editUsername(btn);
},true);

let timer;
function schedule(){
  clearTimeout(timer);
  timer=setTimeout(refreshStaffDetails,70);
}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
schedule();
