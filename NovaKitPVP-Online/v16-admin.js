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

function validUsername(name){
  return /^[A-Za-z0-9_.-]{2,32}$/.test(name);
}

async function saveUsername(userId,input,button){
  if(!supabase)supabase=await getSupabase();

  const username=String(input?.value||'').trim();

  if(!validUsername(username)){
    toast('Username must be 2-32 letters, numbers, dots, dashes or underscores.');
    return;
  }

  button.disabled=true;
  input.disabled=true;

  try{
    const {error}=await supabase.rpc('owner_set_staff_username',{
      target_user_id:userId,
      new_username:username
    });

    if(error)throw error;

    toast(`Staff username set to ${username}`);

    // Refresh the Staff tab so the linked player / role UI immediately updates.
    setTimeout(()=>{
      document.querySelector('[data-tab="staff"]')?.click();
    },250);
  }catch(e){
    toast(e.message||String(e));
    button.disabled=false;
    input.disabled=false;
  }
}

async function refreshStaffCards(){
  const heading=[...document.querySelectorAll('#panel h2')]
    .find(h=>h.textContent.trim()==='Staff Accounts');

  if(!heading)return;

  let body;
  try{
    body=await apiFetch('/api/list-staff');
  }catch(e){
    console.warn('Could not load staff accounts',e);
    return;
  }

  const users=body.users||[];
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
    const display=username && username.toLowerCase()!==String(staff.email||'').toLowerCase()
      ? username
      : 'No username set';

    strong.classList.add('staff-display-name');
    strong.textContent=display;

    let emailLine=textHolder.querySelector('.staff-email-line');
    if(!emailLine){
      emailLine=document.createElement('span');
      emailLine.className='staff-email-line';
      strong.insertAdjacentElement('afterend',emailLine);
    }
    emailLine.textContent=staff.email||'';

    let editor=card.querySelector('.staff-username-inline');
    if(!editor){
      editor=document.createElement('div');
      editor.className='staff-username-inline';

      const input=document.createElement('input');
      input.type='text';
      input.maxLength=32;
      input.placeholder='Set staff / Minecraft username';
      input.className='staff-username-input';

      const save=document.createElement('button');
      save.type='button';
      save.className='btn small';
      save.textContent='Save Username';

      editor.append(input,save);

      // Put username editing beside the account details instead of relying
      // on the old prompt-only "Edit Username" button.
      textHolder.appendChild(editor);

      save.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        saveUsername(userId,input,save);
      });

      input.addEventListener('keydown',e=>{
        if(e.key==='Enter'){
          e.preventDefault();
          save.click();
        }
      });
    }

    const input=editor.querySelector('.staff-username-input');
    if(document.activeElement!==input){
      input.value=(username && username.toLowerCase()!==String(staff.email||'').toLowerCase())
        ? username
        : '';
    }

    const oldButton=card.querySelector('[data-edit-staff-username]');
    if(oldButton)oldButton.remove();

    let linkLine=textHolder.querySelector('.linked-player-line.v203');
    if(staff.role==='tester' && staff.linked_player_name){
      if(!linkLine){
        linkLine=document.createElement('span');
        linkLine.className='linked-player-line v203';
        textHolder.appendChild(linkLine);
      }
      linkLine.textContent=`Linked tierlist player: ${staff.linked_player_name}`;
    }else if(linkLine){
      linkLine.remove();
    }
  });
}

let scheduled=false;
function schedule(){
  if(scheduled)return;
  scheduled=true;

  requestAnimationFrame(async()=>{
    scheduled=false;
    await refreshStaffCards();
  });
}

new MutationObserver(schedule).observe(document.documentElement,{
  childList:true,
  subtree:true
});

schedule();
