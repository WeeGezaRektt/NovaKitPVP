const { requestJson, requireOwner } = require('../lib/owner-auth');
module.exports = async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const base=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!anon||!service)return res.status(503).json({error:'Supabase service settings are not configured'});
  try{
    const {user:owner,ownerSet}=await requireOwner(req,base,anon,service);
    const email=String(req.body?.email||'').trim().toLowerCase(), password=String(req.body?.password||''), username=String(req.body?.username||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Enter a valid email'});
    if(password.length<8||password.length>128)return res.status(400).json({error:'Password must be 8-128 characters'});
    if(ownerSet.has(email))return res.status(400).json({error:'That email is already reserved for an Owner'});
    const created=await requestJson(`${base}/auth/v1/admin/users`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
    await requestJson(`${base}/rest/v1/admin_emails?on_conflict=email`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({email})});
    if(username){await requestJson(`${base}/rest/v1/staff_profiles?on_conflict=auth_user_id`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({auth_user_id:created.id,minecraft_uuid:null,minecraft_username:username,role:'tier_staff',verified:true,linked_at:new Date().toISOString(),updated_at:new Date().toISOString()})});}
    await requestJson(`${base}/rest/v1/audit_logs`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({actor_auth_user_id:owner.id,actor_minecraft_username:owner.email,action:'ADMIN_ACCOUNT_CREATED',change:{email,username:username||null}})});
    return res.status(200).json({ok:true,id:created?.id,email});
  }catch(error){console.error('create-admin',error);return res.status(error.status||500).json({error:error.message||'Could not create Admin'});}
};
