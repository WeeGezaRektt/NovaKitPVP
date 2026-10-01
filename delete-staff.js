async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(typeof data === 'string' ? data : JSON.stringify(data));
    error.status = response.status;
    throw error;
  }
  return data;
}

async function requireOwner(req, base, anon, service) {
  const bearer = String(req.headers.authorization || '');
  if (!bearer.startsWith('Bearer ')) throw Object.assign(new Error('Not authenticated'), { status: 401 });

  const user = await requestJson(`${base}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: bearer }
  });
  const email = String(user?.email || '').trim().toLowerCase();

  const rows = await requestJson(
    `${base}/rest/v1/owner_emails?email=eq.${encodeURIComponent(email)}&select=email&limit=1`,
    { headers: { apikey: service, Authorization: `Bearer ${service}` } }
  );
  if (!rows?.length) throw Object.assign(new Error('Owner access required'), { status: 403 });
  return user;
}module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const base=process.env.SUPABASE_URL;
  const anon=process.env.SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!anon||!service)return res.status(503).json({error:'Supabase service settings are not configured'});

  try{
    const owner=await requireOwner(req,base,anon,service);
    const targetUserId=String(req.body?.targetUserId||'');
    const email=String(req.body?.email||'').trim().toLowerCase();

    const owners=await requestJson(`${base}/rest/v1/owner_emails?select=email`,{
      headers:{apikey:service,Authorization:`Bearer ${service}`}
    });
    if((owners||[]).some(x=>String(x.email||'').toLowerCase()===email)){
      return res.status(400).json({error:'Owner accounts cannot be removed here'});
    }

    for(const table of ['admin_emails','tester_emails']){
      await requestJson(`${base}/rest/v1/${table}?email=eq.${encodeURIComponent(email)}`,{
        method:'DELETE',
        headers:{apikey:service,Authorization:`Bearer ${service}`,Prefer:'return=minimal'}
      });
    }

    await requestJson(`${base}/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`,{
      method:'DELETE',
      headers:{apikey:service,Authorization:`Bearer ${service}`}
    });

    await requestJson(`${base}/rest/v1/audit_logs`,{
      method:'POST',
      headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({
        actor_auth_user_id:owner.id,
        actor_minecraft_username:owner.email,
        action:'ADMIN_ACCOUNT_REMOVED',
        change:{email,target_user_id:targetUserId}
      })
    });

    return res.status(200).json({ok:true});
  }catch(error){
    return res.status(error.status||500).json({error:error.message||'Could not remove staff'});
  }
};
