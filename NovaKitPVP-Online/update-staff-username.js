const OWNER_EMAILS = new Set(['geraldmcbride60@gmail.com','poppymacedu@gmail.com']);

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

async function requireOwner(req){
  const base=process.env.SUPABASE_URL;
  const anon=process.env.SUPABASE_ANON_KEY;
  const bearer=String(req.headers.authorization||'');
  if(!bearer.startsWith('Bearer '))throw Object.assign(new Error('Not authenticated'),{status:401});
  const user=await requestJson(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:bearer}});
  if(!OWNER_EMAILS.has(String(user?.email||'').toLowerCase()))
    throw Object.assign(new Error('Owner access required'),{status:403});
  return user;
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const base=process.env.SUPABASE_URL;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!service)return res.status(503).json({error:'SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel'});

  try{
    const owner=await requireOwner(req);
    const targetUserId=String(req.body?.targetUserId||'').trim();
    const username=String(req.body?.username||'').trim();

    if(!/^[0-9a-f-]{36}$/i.test(targetUserId))
      return res.status(400).json({error:'Invalid staff account'});
    if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username))
      return res.status(400).json({error:'Username must be 2-32 letters, numbers, dots, dashes or underscores'});

    const target=await requestJson(`${base}/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`,{
      headers:{apikey:service,Authorization:`Bearer ${service}`}
    });
    const email=String(target?.email||'').trim().toLowerCase();
    if(!email)return res.status(404).json({error:'Staff account not found'});

    const existing=await requestJson(
      `${base}/rest/v1/staff_profiles?auth_user_id=eq.${encodeURIComponent(targetUserId)}&select=minecraft_username`,
      {headers:{apikey:service,Authorization:`Bearer ${service}`}}
    );
    const before=existing?.[0]?.minecraft_username||null;
    const role=OWNER_EMAILS.has(email)?'owner':'tier_staff';

    await requestJson(`${base}/rest/v1/staff_profiles?on_conflict=auth_user_id`,{
      method:'POST',
      headers:{
        apikey:service,
        Authorization:`Bearer ${service}`,
        'Content-Type':'application/json',
        Prefer:'resolution=merge-duplicates,return=minimal'
      },
      body:JSON.stringify({
        auth_user_id:targetUserId,
        minecraft_username:username,
        role,
        verified:true,
        linked_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      })
    });

    await requestJson(`${base}/rest/v1/audit_logs`,{
      method:'POST',
      headers:{
        apikey:service,
        Authorization:`Bearer ${service}`,
        'Content-Type':'application/json',
        Prefer:'return=minimal'
      },
      body:JSON.stringify({
        actor_auth_user_id:owner.id,
        actor_minecraft_username:owner.email,
        action:'ADMIN_ACCOUNT_USERNAME_UPDATED',
        change:{email,username,before}
      })
    });

    return res.status(200).json({ok:true,email,username});
  }catch(error){
    console.error('update-staff-username',error);
    return res.status(error.status||500).json({error:error.message||'Could not update staff username'});
  }
};
