const OWNER_EMAILS = new Set(['geraldmcbride60@gmail.com','poppymacedu@gmail.com']);
async function requestJson(url, options = {}) {
  const response=await fetch(url,options);
  const text=await response.text();
  let data;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!response.ok) throw new Error(typeof data==='string'?data:JSON.stringify(data));
  return data;
}
async function requireOwner(req){
  const base=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY;
  const bearer=String(req.headers.authorization||'');
  if(!bearer.startsWith('Bearer '))throw Object.assign(new Error('Not authenticated'),{status:401});
  const user=await requestJson(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:bearer}});
  if(!OWNER_EMAILS.has(String(user?.email||'').toLowerCase()))throw Object.assign(new Error('Owner access required'),{status:403});
  return user;
}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const base=process.env.SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!service)return res.status(503).json({error:'SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel'});
  try{
    const owner=await requireOwner(req);
    const email=String(req.body?.email||'').trim().toLowerCase();
    const password=String(req.body?.password||'');
    const username=String(req.body?.username||'').trim();

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Enter a valid email'});
    if(password.length<8||password.length>128)return res.status(400).json({error:'Password must be 8-128 characters'});
    if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username))return res.status(400).json({error:'Staff username must be 2-32 letters, numbers, dots, dashes or underscores'});
    if(OWNER_EMAILS.has(email))return res.status(400).json({error:'That email is already reserved for an Owner'});

    const created=await requestJson(`${base}/auth/v1/admin/users`,{
      method:'POST',
      headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},
      body:JSON.stringify({email,password,email_confirm:true})
    });

    await requestJson(`${base}/rest/v1/admin_emails?on_conflict=email`,{
      method:'POST',
      headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({email})
    });

    await requestJson(`${base}/rest/v1/staff_profiles?on_conflict=auth_user_id`,{
      method:'POST',
      headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({
        auth_user_id:created.id,
        minecraft_uuid:null,
        minecraft_username:username,
        role:'tier_staff',
        verified:true,
        linked_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      })
    });

    await requestJson(`${base}/rest/v1/audit_logs`,{
      method:'POST',
      headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({
        actor_auth_user_id:owner.id,
        actor_minecraft_username:owner.email,
        action:'ADMIN_ACCOUNT_CREATED',
        change:{email,username}
      })
    });

    return res.status(200).json({ok:true,id:created?.id,email,username});
  }catch(error){
    console.error('create-admin',error);
    return res.status(error.status||500).json({error:error.message||'Could not create Admin'});
  }
};
