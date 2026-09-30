const { requestJson, requireOwner } = require('../lib/owner-auth');
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const base=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!anon||!service)return res.status(503).json({error:'Supabase service settings are not configured'});
  try{
    const {user:owner}=await requireOwner(req,base,anon,service);
    const targetUserId=String(req.body?.targetUserId||''), newPassword=String(req.body?.newPassword||'');
    if(!/^[0-9a-f-]{36}$/i.test(targetUserId))return res.status(400).json({error:'Invalid target account'});
    if(newPassword.length<8||newPassword.length>128)return res.status(400).json({error:'Password must be 8-128 characters'});
    await requestJson(`${base}/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`,{method:'PUT',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({password:newPassword})});
    await requestJson(`${base}/rest/v1/audit_logs`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({actor_auth_user_id:owner.id,actor_minecraft_username:owner.email,action:'STAFF_PASSWORD_RESET',change:{target_user_id:targetUserId}})});
    return res.status(200).json({ok:true});
  }catch(error){console.error('reset-staff-password',error);return res.status(error.status||500).json({error:error.message||'Could not reset password'});}
};
