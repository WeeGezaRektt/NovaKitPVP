import { getSupabase } from './supabase-loader.js';
import { GAMEMODES, ACTIVE_TIERS, PEAK_TIERS, RETIRED_TIERS, REGIONS, totalPoints, rankFor, headUrl, esc, fmtDate } from './site-config.js';

let supabase;
let session=null;
let profile=null;
let players=[];
let currentTab='players';
const $=s=>document.querySelector(s);

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3000)}
function region(r){return `<span class="region r-${esc(r)}">${esc(r)}</span>`}
function isOwner(){return profile?.verified&&profile?.role==='owner'}
function canTier(){return profile?.verified&&['owner','tier_staff'].includes(profile?.role)}
function userHead(){return profile?.minecraft_username?`https://mc-heads.net/avatar/${encodeURIComponent(profile.minecraft_username)}/64`:''}

async function boot(){
  try{
    supabase=await getSupabase();
    const {data:{session:s}}=await supabase.auth.getSession();session=s;
    supabase.auth.onAuthStateChange((_evt,s2)=>{session=s2;if(!s2)showAuth()});
    if(session) await routeForSession(); else showAuth();
  }catch(e){$('#authError').textContent=e.message||String(e)}
}
async function routeForSession(){
  $('#logoutBtn').classList.remove('hidden');
  const {data,error}=await supabase.from('staff_profiles').select('*').eq('auth_user_id',session.user.id).maybeSingle();
  if(error)console.error(error);profile=data||null;
  if(!profile?.verified){showLink();return}
  if(!canTier()){showLink();return}
  await showDashboard();
}
function showAuth(){profile=null;session=null;$('#logoutBtn').classList.add('hidden');$('#authView').classList.remove('hidden');$('#linkView').classList.add('hidden');$('#dashboard').classList.add('hidden')}
function showLink(){$('#authView').classList.add('hidden');$('#linkView').classList.remove('hidden');$('#dashboard').classList.add('hidden');$('#logoutBtn').classList.remove('hidden')}
async function showDashboard(){
  $('#authView').classList.add('hidden');$('#linkView').classList.add('hidden');$('#dashboard').classList.remove('hidden');$('#logoutBtn').classList.remove('hidden');
  $('#identity').innerHTML=`<img src="${userHead()}" alt=""><span><strong>${esc(profile.minecraft_username||'Linked Staff')}</strong><small>${isOwner()?'Owner · full access':'Tier Staff · tiers only'}</small></span>`;
  $('#permission').className=`notice permission ${isOwner()?'owner':'success'}`;
  $('#permission').innerHTML=isOwner()?`<b>Owner access</b> — player management, staff/password controls, audit logs and tierlist reset tools are enabled.`:`<b>Tier Staff access</b> — you can change active, peak and retired tiers. Owner-only controls are enforced by the database.`;
  await loadPlayers();renderTabs();renderPanel();
}

$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#authError').textContent='';const email=$('#email').value.trim(),password=$('#password').value;const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error){$('#authError').textContent=error.message;return}session=data.session;await routeForSession()};
$('#signupBtn').onclick=async()=>{const email=$('#email').value.trim(),password=$('#password').value;$('#authError').textContent='';if(!email||password.length<8){$('#authError').textContent='Enter a valid email and a password of at least 8 characters.';return}const {data,error}=await supabase.auth.signUp({email,password});if(error){$('#authError').textContent=error.message;return}if(!data.session){$('#authError').className='success';$('#authError').textContent='Account created. Check your email if Supabase email confirmation is enabled, then sign in.';return}session=data.session;await routeForSession()};
$('#logoutBtn').onclick=async()=>{await supabase.auth.signOut();showAuth()};
$('#generateLink').onclick=async()=>{if(!session)return;$('#linkError').textContent='';const {data,error}=await supabase.rpc('create_link_request');if(error){$('#linkError').textContent=error.message;return}const row=Array.isArray(data)?data[0]:data;if(!row?.code){$('#linkError').textContent='Could not create a link code.';return}$('#linkCode').textContent=row.code;$('#linkCommand').textContent=`/tierlink ${row.code}`;toast('Link code created — valid for 10 minutes')};
$('#checkLink').onclick=async()=>{await routeForSession();if(profile?.verified)toast(`Minecraft account linked as ${profile.minecraft_username}`);else $('#linkError').textContent='Not linked yet. Run the /tierlink command from your staff Minecraft account.'};

async function loadPlayers(){const {data,error}=await supabase.from('players').select('id,name,region,avatar_url,minecraft_uuid,created_at,updated_at,player_tiers(id,gamemode,active_tier,peak_tier,retired_tier,updated_at)').order('name');if(error)throw error;players=data||[]}
function renderTabs(){const allowed=isOwner()?['players','logs','staff','security']:['players'];$('#tabs').innerHTML=allowed.map(t=>`<button class="tab ${currentTab===t?'active':''}" data-tab="${t}">${t==='players'?'Players & Tiers':t==='logs'?'Audit Log':t==='staff'?'Staff Accounts':'Security & Reset'}</button>`).join('');if(!allowed.includes(currentTab))currentTab='players';document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;renderTabs();renderPanel()})}
function renderPanel(){if(currentTab==='players')renderPlayers();else if(currentTab==='logs')renderLogs();else if(currentTab==='staff')renderStaff();else renderSecurity()}
function renderPlayers(){
  const ranked=[...players].sort((a,b)=>totalPoints(b)-totalPoints(a)||a.name.localeCompare(b.name));
  $('#panel').innerHTML=`<div class="panel-row"><div><h2>Players</h2><span class="muted" style="font-size:11px">${players.length} profiles · click a player to edit tiers</span></div><div class="split-actions"><input id="adminSearch" class="search" style="min-width:210px" placeholder="Search players…">${isOwner()?'<button id="addPlayer" class="btn primary small">+ Add Player</button>':''}</div></div><div id="adminPlayers" class="admin-list"></div>`;
  const draw=()=>{const q=$('#adminSearch').value.trim().toLowerCase(),list=ranked.filter(p=>!q||p.name.toLowerCase().includes(q));$('#adminPlayers').innerHTML=list.length?list.map(p=>`<button class="admin-player" data-edit="${p.id}"><img src="${headUrl(p,56)}"><span><strong>${esc(p.name)}</strong><small>${esc(rankFor(totalPoints(p)).name)} · ${totalPoints(p)} points</small></span>${region(p.region)}<span class="admin-score">${totalPoints(p)} pts</span><span class="arrow">›</span></button>`).join(''):'<div class="empty">No matching players.</div>';document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(players.find(p=>p.id===b.dataset.edit)))};draw();$('#adminSearch').oninput=draw;if(isOwner())$('#addPlayer').onclick=()=>openEditor(null)
}
function tierOptions(values,selected,emptyLabel){return `${emptyLabel?`<option value="">${emptyLabel}</option>`:''}${values.map(v=>`<option value="${v}" ${selected===v?'selected':''}>${v}</option>`).join('')}`}
function openEditor(p){
  if(!p&&!isOwner())return;
  $('#editorTitle').textContent=p?`${isOwner()?'Edit':'Edit Tiers —'} ${p.name}`:'Add Player';
  const tiers=Object.fromEntries((p?.player_tiers||[]).map(t=>[t.gamemode,t]));
  $('#editorBody').innerHTML=`${isOwner()?`<div class="editor-grid"><div class="field"><label>Username</label><input id="editName" value="${esc(p?.name||'')}"></div><div class="field"><label>Region</label><select id="editRegion">${REGIONS.map(r=>`<option ${p?.region===r?'selected':''}>${r}</option>`).join('')}</select></div><div class="field"><label>Custom avatar URL</label><input id="editAvatar" value="${esc(p?.avatar_url||'')}"></div></div>`:''}<div style="margin-top:20px"><div class="eyebrow">TIERS</div>${GAMEMODES.map(g=>{const t=tiers[g.id]||{active_tier:'Unranked'};return `<div class="tier-edit" data-mode="${g.id}"><strong>${g.icon} ${esc(g.name)}</strong><select data-kind="active">${tierOptions(ACTIVE_TIERS,t.active_tier)}</select><select data-kind="peak">${tierOptions(PEAK_TIERS,t.peak_tier,'Peak: none')}</select><select data-kind="retired">${tierOptions(RETIRED_TIERS,t.retired_tier,'Retired: none')}</select></div>`}).join('')}</div><div class="split-actions" style="margin-top:20px"><button id="savePlayer" class="btn primary">Save Changes</button>${p&&isOwner()?'<button id="deletePlayer" class="btn danger">Delete Player</button>':''}</div><p id="editorError" class="error"></p>`;
  $('#editorDialog').showModal();
  $('#savePlayer').onclick=()=>saveEditor(p);if(p&&isOwner())$('#deletePlayer').onclick=()=>deletePlayer(p);
}
$('#closeEditor').onclick=()=>$('#editorDialog').close();$('#editorDialog').onclick=e=>{if(e.target===$('#editorDialog'))$('#editorDialog').close()};
async function saveEditor(p){
  $('#editorError').textContent='';
  try{
    let player=p;
    if(!p){
      const name=$('#editName').value.trim(),region=$('#editRegion').value,avatar_url=$('#editAvatar').value.trim()||null;
      if(!/^[A-Za-z0-9_]{3,16}$/.test(name))throw new Error('Minecraft username must be 3-16 letters, numbers or underscores.');
      const {data,error}=await supabase.from('players').insert({name,region,avatar_url}).select().single();if(error)throw error;player=data;
      await loadPlayers();player=players.find(x=>x.id===data.id)||data;
    } else if(isOwner()){
      const name=$('#editName').value.trim(),region=$('#editRegion').value,avatar_url=$('#editAvatar').value.trim()||null;
      if(!/^[A-Za-z0-9_]{3,16}$/.test(name))throw new Error('Invalid Minecraft username.');
      const {error}=await supabase.from('players').update({name,region,avatar_url}).eq('id',p.id);if(error)throw error;
    }
    const updates=[...document.querySelectorAll('.tier-edit')].map(row=>({player_id:player.id,gamemode:row.dataset.mode,active_tier:row.querySelector('[data-kind="active"]').value,peak_tier:row.querySelector('[data-kind="peak"]').value||null,retired_tier:row.querySelector('[data-kind="retired"]').value||null}));
    const {error:tierError}=await supabase.from('player_tiers').upsert(updates,{onConflict:'player_id,gamemode'});if(tierError)throw tierError;
    $('#editorDialog').close();await loadPlayers();renderPlayers();toast('Player saved');
  }catch(e){$('#editorError').textContent=e.message||String(e)}
}
async function deletePlayer(p){if(!isOwner())return;if(!confirm(`Delete ${p.name} and all of their tiers?`))return;const {error}=await supabase.from('players').delete().eq('id',p.id);if(error){$('#editorError').textContent=error.message;return}$('#editorDialog').close();await loadPlayers();renderPlayers();toast(`${p.name} deleted`)}

async function renderLogs(){if(!isOwner())return;$('#panel').innerHTML='<div class="spinner"></div>';const {data,error}=await supabase.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(200);if(error){$('#panel').innerHTML=`<div class="error">${esc(error.message)}</div>`;return}$('#panel').innerHTML=`<div class="panel-row"><div><h2>Audit Log</h2><span class="muted" style="font-size:11px">Latest ${data.length} staff/database events</span></div><button id="refreshLogs" class="btn small">Refresh</button></div><div class="admin-list">${data.length?data.map(l=>`<div class="log"><div class="log-top"><strong>${esc(l.action)}</strong><small>${esc(fmtDate(l.created_at))}</small></div><div class="muted" style="font-size:11px;margin-top:4px">${esc(l.actor_minecraft_username||'System')}</div><pre>${esc(JSON.stringify(l.change||{},null,2))}</pre></div>`).join(''):'<div class="empty">No audit events yet.</div>'}</div>`;$('#refreshLogs').onclick=renderLogs}
async function renderStaff(){if(!isOwner())return;$('#panel').innerHTML='<div class="spinner"></div>';const {data,error}=await supabase.from('staff_profiles').select('*').order('role').order('minecraft_username');if(error){$('#panel').innerHTML=`<div class="error">${esc(error.message)}</div>`;return}$('#panel').innerHTML=`<div class="panel-row"><div><h2>Linked Staff</h2><span class="muted" style="font-size:11px">Minecraft-verified accounts</span></div></div><div class="admin-list">${data.length?data.map(s=>`<div class="staff-card"><img src="https://mc-heads.net/avatar/${encodeURIComponent(s.minecraft_username||'Steve')}/56"><span><strong>${esc(s.minecraft_username||'Pending')}</strong><small>${s.role==='owner'?'Owner':'Tier Staff'} · ${s.verified?'Verified':'Pending'} · linked ${esc(fmtDate(s.linked_at))}</small></span><button class="btn small" data-reset-password="${s.auth_user_id}" data-name="${esc(s.minecraft_username||'staff')}">Reset Password</button></div>`).join(''):'<div class="empty">No linked staff yet.</div>'}</div>`;document.querySelectorAll('[data-reset-password]').forEach(b=>b.onclick=()=>resetPassword(b.dataset.resetPassword,b.dataset.name))}
async function resetPassword(targetUserId,name){const pwd=prompt(`Set a new website password for ${name}. Minimum 8 characters:`);if(!pwd)return;if(pwd.length<8){toast('Password must be at least 8 characters');return}const {data:{session:s}}=await supabase.auth.getSession();const r=await fetch('/api/reset-staff-password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},body:JSON.stringify({targetUserId,newPassword:pwd})});const body=await r.json();if(!r.ok){toast(body.error||'Password reset failed');return}toast(`Password reset for ${name}`)}
function renderSecurity(){if(!isOwner())return;$('#panel').innerHTML=`<div class="panel-row"><div><h2>Security & Reset</h2><span class="muted" style="font-size:11px">Owner-only controls</span></div></div><div class="card panel" style="margin-bottom:12px"><h3>Change my password</h3><p class="muted" style="font-size:12px">Updates the password for your current NovaKitPVP website account.</p><div class="split-actions"><input id="myNewPassword" class="search" type="password" style="min-width:260px" placeholder="New password (8+ chars)"><button id="changeMine" class="btn">Change Password</button></div></div><div class="card panel danger-zone"><h3>Tierlist reset controls</h3><p class="muted" style="font-size:12px"><b>Reset all tiers</b> keeps player profiles but wipes active, peak and retired tiers. <b>Factory reset</b> deletes every player profile and tier. Audit history is kept.</p><div class="split-actions"><button id="resetTiers" class="btn danger">Reset All Tiers</button><button id="factoryReset" class="btn danger">Factory Reset Tierlist</button><button id="exportBackup" class="btn">Export JSON Backup</button></div></div>`;$('#changeMine').onclick=changeMyPassword;$('#resetTiers').onclick=resetTiers;$('#factoryReset').onclick=factoryReset;$('#exportBackup').onclick=exportBackup}
async function changeMyPassword(){const p=$('#myNewPassword').value;if(p.length<8){toast('Password must be at least 8 characters');return}const {error}=await supabase.auth.updateUser({password:p});if(error){toast(error.message);return}$('#myNewPassword').value='';toast('Your password was changed')}
async function resetTiers(){if(!confirm('RESET ALL TIERS for every player? Player profiles will remain.'))return;if(!confirm('Final confirmation: wipe all active, peak and retired tiers?'))return;const {error}=await supabase.rpc('reset_all_tiers');if(error){toast(error.message);return}await loadPlayers();toast('All tiers reset')}
async function factoryReset(){if(!confirm('FACTORY RESET will delete EVERY PLAYER and EVERY TIER. Continue?'))return;const phrase=prompt('Type RESET NOVAKITPVP to confirm:');if(phrase!=='RESET NOVAKITPVP'){toast('Factory reset cancelled');return}const {error}=await supabase.rpc('factory_reset_tierlist');if(error){toast(error.message);return}await loadPlayers();toast('Tierlist factory reset complete')}
async function exportBackup(){const {data:logs}=await supabase.from('audit_logs').select('*').order('created_at',{ascending:true});const {data:staff}=await supabase.from('staff_profiles').select('*');const payload={exported_at:new Date().toISOString(),players,staff_profiles:staff||[],audit_logs:logs||[]};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`novakitpvp-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}

boot();
