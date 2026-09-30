const { requestJson, requireOwner } = require('../lib/owner-auth');
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const base=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!anon||!service)return res.status(503).json({error:'Supabase service settings are not configured'});
  try{
    const {user:owner,ownerSet}=await requireOwner(req,base,anon,service);
    const targetUserId=String(req.body?.targetUserId||''), email=String(req.body?.email||'').trim().toLowerCase();
    if(!/^[0-9a-f-]{36}$/i.test(targetUserId))return res.status(400).json({error:'Invalid target account'});
    if(ownerSet.has(email))return res.status(400).json({error:'Owner accounts cannot be removed here'});
    await requestJson(`${base}/rest/v1/admin_emails?email=eq.${encodeURIComponent(email)}`,{method:'DELETE',headers:{apikey:service,Authorization:`Bearer ${service}`,Prefer:'return=minimal'}});
    await requestJson(`${base}/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`,{method:'DELETE',headers:{apikey:service,Authorization:`Bearer ${service}`}});
    await requestJson(`${base}/rest/v1/audit_logs`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({actor_auth_user_id:owner.id,actor_minecraft_username:owner.email,action:'ADMIN_ACCOUNT_REMOVED',change:{email,target_user_id:targetUserId}})});
    return res.status(200).json({ok:true});
  }catch(error){console.error('delete-staff',error);return res.status(error.status||500).json({error:error.message||'Could not remove Admin'});}
};
