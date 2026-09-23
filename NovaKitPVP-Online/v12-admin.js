import { getSupabase } from './supabase-loader.js';

const BEDROCK_RE=/^\.[A-Za-z0-9_]{3,16}$/;
let supabase;
getSupabase().then(s=>supabase=s).catch(()=>{});

function bedrockSkinUrl(name){
  return `https://api.creepernation.net/head/${encodeURIComponent(name)}?size=128&prefix=.`;
}

function patchBedrockImages(root=document){
  root.querySelectorAll?.('img[alt^="."]').forEach(img=>{
    if(img.dataset.bedrockSkinApplied==='1')return;
    img.dataset.bedrockSkinApplied='1';
    img.src=bedrockSkinUrl((img.getAttribute('alt')||'').trim());
  });
}
patchBedrockImages();
new MutationObserver(muts=>{
  for(const m of muts){
    for(const n of m.addedNodes){
      if(n.nodeType!==1)continue;
      patchBedrockImages(n);
      const username=n.querySelector?.('#editName');
      if(username) addBedrockHint(username);
    }
  }
}).observe(document.documentElement,{childList:true,subtree:true});

function addBedrockHint(input){
  if(!input || input.dataset.bedrockHint==='1')return;
  input.dataset.bedrockHint='1';
  const note=document.createElement('div');
  note.className='profile-note bedrock-name-note';
  note.innerHTML='<b>Bedrock:</b> use the exact Floodgate name including the dot, e.g. <code>.F_swung_u</code>. The site will use the Geyser/Bedrock skin automatically.';
  input.closest('.field')?.appendChild(note);
}

async function saveBedrockPlayer(button){
  if(!supabase) supabase=await getSupabase();
  const name=document.querySelector('#editName')?.value.trim()||'';
  if(!name.startsWith('.')) return false;

  if(!BEDROCK_RE.test(name)){
    const err=document.querySelector('#editorError');
    if(err)err.textContent='Bedrock username must start with a dot, followed by 3-16 letters, numbers or underscores.';
    return true;
  }

  const region=document.querySelector('#editRegion')?.value||'EU';
  const customAvatar=document.querySelector('#editAvatar')?.value.trim()||null;
  const title=(document.querySelector('#editorTitle')?.textContent||'').trim();
  const isNew=title==='Add Player';
  const oldName=!isNew && title.startsWith('Edit ') ? title.slice(5) : null;
  const err=document.querySelector('#editorError');
  if(err)err.textContent='';

  try{
    button.disabled=true;
    button.textContent='Saving…';
    let playerId;

    if(isNew){
      const {data,error}=await supabase.from('players').insert({
        name,
        region,
        avatar_url:customAvatar,
        minecraft_uuid:null
      }).select('id').single();
      if(error)throw error;
      playerId=data.id;
    }else{
      const {data:existing,error:findError}=await supabase.from('players').select('id').eq('name',oldName).single();
      if(findError)throw findError;
      playerId=existing.id;
      const {error}=await supabase.from('players').update({
        name,
        region,
        avatar_url:customAvatar,
        minecraft_uuid:null
      }).eq('id',playerId);
      if(error)throw error;
    }

    const updates=[...document.querySelectorAll('.tier-edit')].map(row=>({
      player_id:playerId,
      gamemode:row.dataset.mode,
      active_tier:row.querySelector('[data-kind="active"]')?.value||'Unranked',
      peak_tier:row.querySelector('[data-kind="peak"]')?.value||null,
      retired_tier:row.querySelector('[data-kind="retired"]')?.value||null
    }));
    const {error:tierError}=await supabase.from('player_tiers').upsert(updates,{onConflict:'player_id,gamemode'});
    if(tierError)throw tierError;

    document.querySelector('#editorDialog')?.close();
    location.reload();
  }catch(e){
    if(err)err.textContent=e?.message||String(e);
    button.disabled=false;
    button.textContent='Save Changes';
  }
  return true;
}

document.addEventListener('click',async e=>{
  const btn=e.target.closest?.('#savePlayer');
  if(!btn)return;
  const name=document.querySelector('#editName')?.value.trim()||'';
  if(!name.startsWith('.'))return;
  e.preventDefault();
  e.stopImmediatePropagation();
  await saveBedrockPlayer(btn);
},true);
