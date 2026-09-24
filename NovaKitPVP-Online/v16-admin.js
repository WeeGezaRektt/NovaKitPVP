
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
  if(!r.ok)throw new Error(body.error||`Request failed (${r.status})`);
  return body;
}

async function refreshStaffCards(){
  const heading=[...document.querySelectorAll('#panel h2')].find(h=>h.textContent.trim()==='Staff Accounts');
  if(!heading)return;

  let body;
  try{
    body=await apiFetch('/api/list-staff');
  }catch(e){
    console.warn(e);
    return;
  }

  const users=body.users||[];
  const byEmail=new Map(users.map(u=>[String(u.email||'').toLowerCase(),u]));

  document.querySelectorAll('.staff-card').forEach(card=>{
    const reset=card.querySelector('[data-reset-password]');
    if(!reset)return;

    const targetUserId=reset.dataset.resetPassword;
    const textHolder=card.querySelector('span:nth-child(2)');
    const currentStrong=textHolder?.querySelector('strong');
    if(!textHolder||!currentStrong)return;

    let email='';
    const emailLine=textHolder.querySelector('.staff-email-line');
    if(emailLine) email=emailLine.textContent.trim().toLowerCase();
    else email=currentStrong.textContent.trim().toLowerCase();

    const staff=byEmail.get(email) || users.find(u=>u.id===targetUserId);
    if(!staff)return;

    currentStrong.classList.add('staff-display-name');
    currentStrong.textContent=staff.username||staff.email;

    let line=textHolder.querySelector('.staff-email-line');
    if(!line){
      line=document.createElement('span');
      line.className='staff-email-line';
      currentStrong.insertAdjacentElement('afterend',line);
    }
    line.textContent=staff.email;

    const actions=card.querySelector('.split-actions');
    if(actions&&!actions.querySelector('[data-edit-staff-username]')){
      const btn=document.createElement('button');
      btn.className='btn small staff-username-edit';
      btn.textContent='Edit Username';
      btn.dataset.editStaffUsername=staff.id;
      btn.dataset.currentUsername=staff.username||'';
      btn.dataset.email=staff.email||'';
      actions.prepend(btn);
    }else{
      const btn=actions?.querySelector('[data-edit-staff-username]');
      if(btn){
        btn.dataset.currentUsername=staff.username||'';
        btn.dataset.email=staff.email||'';
      }
    }
  });
}

async function editStaffUsername(btn){
  const current=btn.dataset.currentUsername||'';
  const email=btn.dataset.email||'this staff member';
  const username=prompt(`Set the staff username for ${email}:`,current);
  if(username===null)return;

  const clean=username.trim();
  if(!/^[A-Za-z0-9_.-]{2,32}$/.test(clean)){
    toast('Username must be 2-32 letters, numbers, dots, dashes or underscores.');
    return;
  }

  btn.disabled=true;
  try{
    await apiFetch('/api/update-staff-username',{
      method:'POST',
      body:JSON.stringify({
        targetUserId:btn.dataset.editStaffUsername,
        username:clean
      })
    });
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
  editStaffUsername(btn);
});

let timer;
function schedule(){
  clearTimeout(timer);
  timer=setTimeout(refreshStaffCards,80);
}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
schedule();
