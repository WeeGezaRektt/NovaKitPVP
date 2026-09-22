import { getSupabase } from './supabase-loader.js';
import { GAMEMODES, RANKS, ACTIVE_TIERS, PEAK_TIERS, RETIRED_TIERS, REGIONS, DEFAULT_ASSETS, OWNER_EMAILS, totalPoints, rankFor, headImg, bindHeadFallbacks, iconMarkup, assetValue, esc, fmtDate } from './site-config.js';

let supabase;
let session=null;
let access={email:'',role:'none'};
let players=[];
let assets={...DEFAULT_ASSETS};
let currentTab='players';
const $=s=>document.querySelector(s);

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3000)}
function region(r){return `<span class="region r-${esc(r)}">${esc(r)}</span>`}
function isOwner(){return access.role==='owner'}
function isAdmin(){return access.role==='owner'||access.role==='admin'}
function rowsToAssets(rows){return {...DEFAULT_ASSETS,...Object.fromEntries((rows||[]).map(r=>[r.asset_key,r.asset_value]))}}
function applyBrand(){const el=$('#brandMark');if(el)el.innerHTML=iconMarkup(assetValue(assets,'brand_logo'),'brand-icon')}
function staffAvatar(){const c=(access.email||'?').charAt(0).toUpperCase();return `<span class="email-avatar">${esc(c)}</span>`}
function modeIcon(g){return iconMarkup(assetValue(assets,g.assetKey),'asset-icon')}

async function boot(){
  try{
    supabase=await getSupabase();
    const {data:{session:s}}=await supabase.auth.getSession();session=s;
    const {data:assetRows}=await supabase.from('site_assets').select('asset_key,asset_value');
    assets=rowsToAssets(assetRows);applyBrand();
    supabase.auth.onAuthStateChange((_evt,s2)=>{session=s2;if(!s2)showAuth()});
    if(session) await routeForSession(); else showAuth();
  }catch(e){$('#authError').textContent=e.message||String(e)}
}
async function routeForSession(){
  $('#logoutBtn').classList.remove('hidden');
  const {data,error}=await supabase.rpc('get_my_access');
  if(error){console.error(error);showDenied();return}
  const row=Array.isArray(data)?data[0]:data;
  access=row||{email:session?.user?.email||'',role:'none'};
  if(!isAdmin()){showDenied();return}
  await showDashboard();
}
function showAuth(){access={email:'',role:'none'};session=null;$('#logoutBtn').classList.add('hidden');$('#authView').classList.remove('hidden');$('#deniedView').classList.add('hidden');$('#dashboard').classList.add('hidden')}
function showDenied(){$('#authView').classList.add('hidden');$('#deniedView').classList.remove('hidden');$('#dashboard').classList.add('hidden');$('#logoutBtn').classList.remove('hidden')}
async function showDashboard(){
  $('#authView').classList.add('hidden');$('#deniedView').classList.add('hidden');$('#dashboard').classList.remove('hidden');$('#logoutBtn').classList.remove('hidden');
  $('#identity').innerHTML=`${staffAvatar()}<span><strong>${esc(access.email)}</strong><small>${isOwner()?'Owner · full access':'Admin · individual players only'}</small></span>`;
  $('#permission').className=`notice permission ${isOwner()?'owner':'success'}`;
  $('#permission').innerHTML=isOwner()?`<b>Owner access</b> — individual player management plus audit logs, staff/password controls, appearance icons and global reset tools.`:`<b>Admin access</b> — you can edit tiers/profile details or remove individual players. Password, staff, audit-log, appearance and global reset controls are Owner-only.`;
  await Promise.all([loadPlayers(),loadAssets()]);renderTabs();renderPanel();
}

$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#authError').textContent='';const email=$('#email').value.trim(),password=$('#password').value;const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error){$('#authError').textContent=error.message;return}session=data.session;await routeForSession()};
$('#signupBtn').onclick=async()=>{const email=$('#email').value.trim().toLowerCase(),password=$('#password').value;$('#authError').textContent='';if(!OWNER_EMAILS.includes(email)){$('#authError').textContent='Only the two Owner emails can self-create an account. Owners create Admin accounts from the Staff tab.';return}if(password.length<8){$('#authError').textContent='Password must be at least 8 characters.';return}const {data,error}=await supabase.auth.signUp({email,password});if(error){$('#authError').textContent=error.message;return}if(!data.session){$('#authError').className='success';$('#authError').textContent='Owner account created. Check your email if confirmation is enabled, then sign in.';return}session=data.session;await routeForSession()};
$('#logoutBtn').onclick=async()=>{await supabase.auth.signOut();showAuth()};
$('#deniedLogout').onclick=async()=>{await supabase.auth.signOut();showAuth()};

async function loadAssets(){const {data,error}=await supabase.from('site_assets').select('asset_key,asset_value');if(error)console.warn(error);assets=rowsToAssets(data);applyBrand()}
async function loadPlayers(){const {data,error}=await supabase.from('players').select('id,name,region,avatar_url,minecraft_uuid,created_at,updated_at,player_tiers(id,gamemode,active_tier,peak_tier,retired_tier,updated_at)').order('name');if(error)throw error;players=data||[]}
function renderTabs(){const allowed=isOwner()?['players','logs','staff','appearance','security']:['players'];if(!allowed.includes(currentTab))currentTab='players';const labels={players:'Players & Tiers',logs:'Audit Log',staff:'Staff Accounts',appearance:'Appearance',security:'Security & Reset'};$('#tabs').innerHTML=allowed.map(t=>`<button class="tab ${currentTab===t?'active':''}" data-tab="${t}">${labels[t]}</button>`).join('');document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;renderTabs();renderPanel()})}
function renderPanel(){if(currentTab==='players')renderPlayers();else if(currentTab==='logs')renderLogs();else if(currentTab==='staff')renderStaff();else if(currentTab==='appearance')renderAppearance();else renderSecurity()}
function renderPlayers(){
  const ranked=[...players].sort((a,b)=>totalPoints(b)-totalPoints(a)||a.name.localeCompare(b.name));
  $('#panel').innerHTML=`<div class="panel-row"><div><h2>Players</h2><span class="muted" style="font-size:11px">${players.length} profiles · click a player to edit</span></div><div class="split-actions"><input id="adminSearch" class="search" style="min-width:210px" placeholder="Search players…">${isOwner()?'<button id="addPlayer" class="btn primary small">+ Add Player</button>':''}</div></div><div id="adminPlayers" class="admin-list"></div>`;
  const draw=()=>{const q=$('#adminSearch').value.trim().toLowerCase(),list=ranked.filter(p=>!q||p.name.toLowerCase().includes(q));$('#adminPlayers').innerHTML=list.length?list.map(p=>`<button class="admin-player" data-edit="${p.id}">${headImg(p,56,p.name)}<span><strong>${esc(p.name)}</strong><small>${esc(rankFor(totalPoints(p),assets).name)} · ${totalPoints(p)} points</small></span>${region(p.region)}<span class="admin-score">${totalPoints(p)} pts</span><span class="arrow">›</span></button>`).join(''):'<div class="empty">No matching players.</div>';document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(players.find(p=>p.id===b.dataset.edit)));bindHeadFallbacks($('#adminPlayers'))};draw();$('#adminSearch').oninput=draw;if(isOwner())$('#addPlayer').onclick=()=>openEditor(null)
}
function tierOptions(values,selected,emptyLabel){return `${emptyLabel?`<option value="">${emptyLabel}</option>`:''}${values.map(v=>`<option value="${v}" ${selected===v?'selected':''}>${v}</option>`).join('')}`}
function openEditor(p){
  if(!p&&!isOwner())return;
  $('#editorTitle').textContent=p?`Edit ${p.name}`:'Add Player';
  const tiers=Object.fromEntries((p?.player_tiers||[]).map(t=>[t.gamemode,t]));
  $('#editorBody').innerHTML=`<div class="editor-grid"><div class="field"><label>Username</label><input id="editName" value="${esc(p?.name||'')}"></div><div class="field"><label>Region</label><select id="editRegion">${REGIONS.map(r=>`<option ${p?.region===r?'selected':''}>${r}</option>`).join('')}</select></div><div class="field"><label>Custom avatar URL (Bedrock/custom)</label><input id="editAvatar" value="${esc(p?.avatar_url||'')}"></div></div><div class="profile-note">Java heads are resolved automatically from the Java username when possible. Custom avatar URL overrides the Java head.</div><div style="margin-top:20px"><div class="eyebrow">TIERS</div>${GAMEMODES.map(g=>{const t=tiers[g.id]||{active_tier:'Unranked'};return `<div class="tier-edit" data-mode="${g.id}"><strong><span class="inline-kit-icon">${modeIcon(g)}</span> ${esc(g.name)}</strong><select data-kind="active">${tierOptions(ACTIVE_TIERS,t.active_tier)}</select><select data-kind="peak">${tierOptions(PEAK_TIERS,t.peak_tier,'Peak: none')}</select><select data-kind="retired">${tierOptions(RETIRED_TIERS,t.retired_tier,'Retired: none')}</select></div>`}).join('')}</div><div class="split-actions" style="margin-top:20px"><button id="savePlayer" class="btn primary">Save Changes</button>${p?'<button id="deletePlayer" class="btn danger">Delete Player</button>':''}</div><p id="editorError" class="error"></p>`;
  $('#editorDialog').showModal();
  $('#savePlayer').onclick=()=>saveEditor(p);if(p)$('#deletePlayer').onclick=()=>deletePlayer(p);
}
$('#closeEditor').onclick=()=>$('#editorDialog').close();$('#editorDialog').onclick=e=>{if(e.target===$('#editorDialog'))$('#editorDialog').close()};
async function resolveJava(name){try{const r=await fetch(`/api/java-profile?name=${encodeURIComponent(name)}`);if(!r.ok)return null;return await r.json()}catch{return null}}
async function saveEditor(p){
  $('#editorError').textContent='';
  try{
    const name=$('#editName').value.trim(),regionValue=$('#editRegion').value,avatar_url=$('#editAvatar').value.trim()||null;
    if(!/^[A-Za-z0-9_]{3,16}$/.test(name))throw new Error('Minecraft username must be 3-16 letters, numbers or underscores.');
    const javaProfile=avatar_url?null:await resolveJava(name);
    let player=p;
    if(!p){
      if(!isOwner())throw new Error('Only Owners can add new players.');
      const {data,error}=await supabase.from('players').insert({name,region:regionValue,avatar_url,minecraft_uuid:javaProfile?.uuid||null}).select().single();if(error)throw error;player=data;
      await loadPlayers();player=players.find(x=>x.id===data.id)||data;
    } else {
      const update={name,region:regionValue,avatar_url};
      if(javaProfile?.uuid)update.minecraft_uuid=javaProfile.uuid;
      const {error}=await supabase.from('players').update(update).eq('id',p.id);if(error)throw error;
    }
    const updates=[...document.querySelectorAll('.tier-edit')].map(row=>({player_id:player.id,gamemode:row.dataset.mode,active_tier:row.querySelector('[data-kind="active"]').value,peak_tier:row.querySelector('[data-kind="peak"]').value||null,retired_tier:row.querySelector('[data-kind="retired"]').value||null}));
    const {error:tierError}=await supabase.from('player_tiers').upsert(updates,{onConflict:'player_id,gamemode'});if(tierError)throw tierError;
    $('#editorDialog').close();await loadPlayers();renderPlayers();toast(javaProfile?.uuid?'Player saved · Java head linked':'Player saved');
  }catch(e){$('#editorError').textContent=e.message||String(e)}
}
async function deletePlayer(p){if(!isAdmin())return;if(!confirm(`Delete ${p.name} and all of their tiers?`))return;const {error}=await supabase.from('players').delete().eq('id',p.id);if(error){$('#editorError').textContent=error.message;return}$('#editorDialog').close();await loadPlayers();renderPlayers();toast(`${p.name} deleted`)}

async function renderLogs(){if(!isOwner())return;$('#panel').innerHTML='<div class="spinner"></div>';const {data,error}=await supabase.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(200);if(error){$('#panel').innerHTML=`<div class="error">${esc(error.message)}</div>`;return}$('#panel').innerHTML=`<div class="panel-row"><div><h2>Audit Log</h2><span class="muted" style="font-size:11px">Latest ${data.length} events · Owner-only</span></div><div class="split-actions"><button id="refreshLogs" class="btn small">Refresh</button><button id="clearLogs" class="btn danger small">Clear Logs</button></div></div><div class="admin-list">${data.length?data.map(l=>`<div class="log"><div class="log-top"><strong>${esc(l.action)}</strong><small>${esc(fmtDate(l.created_at))}</small></div><div class="muted" style="font-size:11px;margin-top:4px">${esc(l.actor_minecraft_username||'System')}</div><pre>${esc(JSON.stringify(l.change||{},null,2))}</pre></div>`).join(''):'<div class="empty">No audit events yet.</div>'}</div>`;$('#refreshLogs').onclick=renderLogs;$('#clearLogs').onclick=clearLogs}
async function clearLogs(){if(!confirm('Clear the audit log? Admins cannot do this.'))return;const {error}=await supabase.rpc('clear_audit_logs');if(error){toast(error.message);return}toast('Audit log cleared');renderLogs()}

async function apiFetch(path,options={}){const {data:{session:s}}=await supabase.auth.getSession();const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s?.access_token||''}`,...(options.headers||{})}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||`Request failed (${r.status})`);return body}
async function renderStaff(){
  if(!isOwner())return;$('#panel').innerHTML='<div class="spinner"></div>';
  try{
    const body=await apiFetch('/api/list-staff');const staff=body.users||[];
    $('#panel').innerHTML=`<div class="panel-row"><div><h2>Staff Accounts</h2><span class="muted" style="font-size:11px">Only Owners can create, remove or reset Admin accounts</span></div></div><div class="card inner-card"><h3>Create Admin</h3><div class="form-row"><div class="field"><label>Email</label><input id="newAdminEmail" type="email" placeholder="staff@example.com"></div><div class="field"><label>Temporary password</label><input id="newAdminPassword" type="password" placeholder="8+ characters"></div></div><div class="auth-actions"><button id="createAdmin" class="btn primary">Create Admin Account</button></div></div><div class="admin-list" style="margin-top:14px">${staff.length?staff.map(s=>`<div class="staff-card"><span class="email-avatar">${esc((s.email||'?').charAt(0).toUpperCase())}</span><span><strong>${esc(s.email)}</strong><small>${s.role==='owner'?'Owner':'Admin'} · ${s.confirmed?'Confirmed':'Unconfirmed'} · created ${esc(fmtDate(s.created_at))}</small></span><div class="split-actions"><button class="btn small" data-reset-password="${s.id}" data-name="${esc(s.email)}">Reset Password</button>${s.role!=='owner'?`<button class="btn danger small" data-remove-staff="${s.id}" data-email="${esc(s.email)}">Remove</button>`:''}</div></div>`).join(''):'<div class="empty">No staff accounts yet.</div>'}</div>`;
    $('#createAdmin').onclick=createAdmin;document.querySelectorAll('[data-reset-password]').forEach(b=>b.onclick=()=>resetPassword(b.dataset.resetPassword,b.dataset.name));document.querySelectorAll('[data-remove-staff]').forEach(b=>b.onclick=()=>removeStaff(b.dataset.removeStaff,b.dataset.email));
  }catch(e){$('#panel').innerHTML=`<div class="error">${esc(e.message)}</div><p class="muted">The Owner-only staff API needs SUPABASE_SERVICE_ROLE_KEY in Vercel.</p>`}
}
async function createAdmin(){const email=$('#newAdminEmail').value.trim(),password=$('#newAdminPassword').value;try{await apiFetch('/api/create-admin',{method:'POST',body:JSON.stringify({email,password})});toast(`Admin created for ${email}`);renderStaff()}catch(e){toast(e.message)}}
async function resetPassword(targetUserId,name){const pwd=prompt(`Set a new website password for ${name}. Minimum 8 characters:`);if(!pwd)return;try{await apiFetch('/api/reset-staff-password',{method:'POST',body:JSON.stringify({targetUserId,newPassword:pwd})});toast(`Password reset for ${name}`)}catch(e){toast(e.message)}}
async function removeStaff(targetUserId,email){if(!confirm(`Remove Admin access and delete the website account for ${email}?`))return;try{await apiFetch('/api/delete-staff',{method:'POST',body:JSON.stringify({targetUserId,email})});toast(`${email} removed`);renderStaff()}catch(e){toast(e.message)}}

function assetField(key,label,value){const current=(value||DEFAULT_ASSETS[key]||'').trim();const isUrl=/^https?:\/\//i.test(current);return `<div class="asset-row" data-asset-row="${esc(key)}"><div class="asset-preview" data-preview="${esc(key)}">${iconMarkup(current,'asset-preview-icon')}</div><div class="grow asset-input-wrap"><label>${esc(label)}</label><input class="asset-input" data-asset="${esc(key)}" value="${esc(current)}" placeholder="Paste an image URL or upload a file below"><div class="asset-upload-row"><input class="asset-file" type="file" accept=".png,.svg,.webp,.jpg,.jpeg,image/png,image/svg+xml,image/webp,image/jpeg" data-asset-upload="${esc(key)}"><button class="btn small" type="button" data-asset-default="${esc(key)}">Reset default</button></div><div class="asset-help">Upload PNG, SVG, WEBP or JPG up to 10 MB. The file is stored in NovaKitPVP storage, so large PNGs work properly.</div><div class="asset-flag">Current source: <b data-source-label="${esc(key)}">${isUrl?'Uploaded / image URL':'Default icon'}</b></div></div></div>`}
function linkField(key,label,value){return `<div class="field link-field"><label>${esc(label)}</label><input class="asset-input" data-asset="${esc(key)}" value="${esc(value||'')}" placeholder="https://discord.gg/yourserver"><div class="asset-help">Leave blank to hide the Join Discord button.</div></div>`}
function updateAssetPreview(key,value){const preview=document.querySelector(`[data-preview="${key}"]`);if(preview)preview.innerHTML=iconMarkup(value,'asset-preview-icon');const label=document.querySelector(`[data-source-label="${key}"]`);if(label){const v=String(value||'').trim();label.textContent=/^https?:\/\//i.test(v)?'Uploaded / image URL':(v===String(DEFAULT_ASSETS[key]||'').trim()?'Default icon':'Custom value');}}
function cleanFileName(name){return String(name||'icon').replace(/[^A-Za-z0-9._-]+/g,'-').slice(-90)}
async function uploadAssetFile(key,file){const allowed=['image/png','image/svg+xml','image/webp','image/jpeg'];if(!allowed.includes(file.type))throw new Error('Please upload a PNG, SVG, WEBP or JPG file.');if(file.size>10*1024*1024)throw new Error('Icon file is too large. Keep it under 10 MB.');const path=`${key}/${Date.now()}-${cleanFileName(file.name)}`;const {error}=await supabase.storage.from('site-assets').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(error)throw error;const {data}=supabase.storage.from('site-assets').getPublicUrl(path);if(!data?.publicUrl)throw new Error('Could not create the public icon URL.');return data.publicUrl}
function wireAppearanceInputs(){document.querySelectorAll('[data-asset-default]').forEach(b=>b.onclick=()=>{const key=b.dataset.assetDefault;const input=document.querySelector(`[data-asset="${key}"]`);const file=document.querySelector(`[data-asset-upload="${key}"]`);if(input)input.value=DEFAULT_ASSETS[key]||'';if(file)file.value='';updateAssetPreview(key,input?.value||'');});document.querySelectorAll('[data-asset-upload]').forEach(input=>input.onchange=async()=>{const key=input.dataset.assetUpload;const file=input.files?.[0];if(!file)return;input.disabled=true;toast(`Uploading ${file.name}…`);try{const publicUrl=await uploadAssetFile(key,file);const target=document.querySelector(`[data-asset="${key}"]`);if(target){target.value=publicUrl;updateAssetPreview(key,publicUrl);}toast(`${file.name} uploaded. Click Save Icons to publish it.`)}catch(e){toast(e.message||'Could not upload file')}finally{input.value='';input.disabled=false;}})}
function renderAppearance(){if(!isOwner())return;const kitFields=GAMEMODES.map(g=>assetField(g.assetKey,g.name,assetValue(assets,g.assetKey))).join('');const rankFields=RANKS.map(r=>assetField(r.assetKey,r.name,assetValue(assets,r.assetKey))).join('');$('#panel').innerHTML=`<div class="panel-row"><div><h2>Appearance & Links</h2><span class="muted" style="font-size:11px">Owner-only branding, icon uploads and public links.</span></div><button id="saveAssets" class="btn primary small">Save Changes</button></div><div class="appearance-grid"><section class="card inner-card"><h3>Website</h3>${assetField('brand_logo','Top-left NovaKitPVP icon',assetValue(assets,'brand_logo'))}${linkField('discord_url','Discord invite link',assetValue(assets,'discord_url'))}</section><section class="card inner-card"><h3>Kit Icons</h3>${kitFields}</section><section class="card inner-card"><h3>Combat Rank Icons</h3>${rankFields}</section></div>`;wireAppearanceInputs();$('#saveAssets').onclick=saveAssets}
async function saveAssets(){const rows=[...document.querySelectorAll('[data-asset]')].map(i=>({asset_key:i.dataset.asset,asset_value:i.value.trim()||DEFAULT_ASSETS[i.dataset.asset]||''}));const {error}=await supabase.from('site_assets').upsert(rows,{onConflict:'asset_key'});if(error){toast(error.message);return}await loadAssets();toast('Appearance and links updated everywhere')}


function renderSecurity(){if(!isOwner())return;$('#panel').innerHTML=`<div class="panel-row"><div><h2>Security & Reset</h2><span class="muted" style="font-size:11px">Owner-only controls</span></div></div><div class="card inner-card" style="margin-bottom:12px"><h3>Change my password</h3><p class="muted" style="font-size:12px">Admins do not get this control.</p><div class="split-actions"><input id="myNewPassword" class="search" type="password" style="min-width:260px" placeholder="New password (8+ chars)"><button id="changeMine" class="btn">Change Password</button></div></div><div class="card panel danger-zone"><h3>Global tierlist reset</h3><p class="muted" style="font-size:12px"><b>Reset all tiers</b> keeps player profiles but wipes active, peak and retired tiers. <b>Factory reset</b> deletes every player profile and tier. Admins cannot run either action.</p><div class="split-actions"><button id="resetTiers" class="btn danger">Reset All Tiers</button><button id="factoryReset" class="btn danger">Factory Reset Tierlist</button><button id="exportBackup" class="btn">Export JSON Backup</button></div></div>`;$('#changeMine').onclick=changeMyPassword;$('#resetTiers').onclick=resetTiers;$('#factoryReset').onclick=factoryReset;$('#exportBackup').onclick=exportBackup}
async function changeMyPassword(){const p=$('#myNewPassword').value;if(p.length<8){toast('Password must be at least 8 characters');return}const {error}=await supabase.auth.updateUser({password:p});if(error){toast(error.message);return}$('#myNewPassword').value='';toast('Your password was changed')}
async function resetTiers(){if(!confirm('RESET ALL TIERS for every player? Player profiles will remain.'))return;if(!confirm('Final confirmation: wipe all active, peak and retired tiers?'))return;const {error}=await supabase.rpc('reset_all_tiers');if(error){toast(error.message);return}await loadPlayers();toast('All tiers reset')}
async function factoryReset(){if(!confirm('FACTORY RESET will delete EVERY PLAYER and EVERY TIER. Continue?'))return;const phrase=prompt('Type RESET NOVAKITPVP to confirm:');if(phrase!=='RESET NOVAKITPVP'){toast('Factory reset cancelled');return}const {error}=await supabase.rpc('factory_reset_tierlist');if(error){toast(error.message);return}await loadPlayers();toast('Tierlist factory reset complete')}
async function exportBackup(){const {data:logs}=await supabase.from('audit_logs').select('*').order('created_at',{ascending:true});const {data:siteAssets}=await supabase.from('site_assets').select('*');const payload={exported_at:new Date().toISOString(),players,site_assets:siteAssets||[],audit_logs:logs||[]};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`novakitpvp-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}

boot();
