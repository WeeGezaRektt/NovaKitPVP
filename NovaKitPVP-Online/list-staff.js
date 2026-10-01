async function requestJson(url, options = {}) { const response=await fetch(url,options); const text=await response.text(); let data; try{data=text?JSON.parse(text):null}catch{data=text} if(!response.ok){const e=new Error(typeof data==='string'?data:JSON.stringify(data));e.status=response.status;throw e} return data; }
async function getAuthUser(req,base,anon){const bearer=String(req.headers.authorization||'');if(!bearer.startsWith('Bearer '))throw Object.assign(new Error('Not authenticated'),{status:401});return requestJson(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:bearer}})}
async function getRoles(base,service){const [o,a,t]=await Promise.all([requestJson(`${base}/rest/v1/owner_emails?select=email`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),requestJson(`${base}/rest/v1/admin_emails?select=email`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),requestJson(`${base}/rest/v1/tester_emails?select=email`,{headers:{apikey:service,Authorization:`Bearer ${service}`}})]);return{owners:new Set((o||[]).map(x=>String(x.email||'').toLowerCase())),admins:new Set((a||[]).map(x=>String(x.email||'').toLowerCase())),testers:new Set((t||[]).map(x=>String(x.email||'').toLowerCase()))}}
async function requireOwner(req,base,anon,service){const user=await getAuthUser(req,base,anon);const roles=await getRoles(base,service);if(!roles.owners.has(String(user?.email||'').toLowerCase()))throw Object.assign(new Error('Owner access required'),{status:403});return{user,roles}}
module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const base=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!anon||!service)return res.status(503).json({error:'Supabase service settings are not configured'});
  try{
    const {roles}=await requireOwner(req,base,anon,service);
    const [authData,profiles,players]=await Promise.all([
      requestJson(`${base}/auth/v1/admin/users?page=1&per_page=1000`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),
      requestJson(`${base}/rest/v1/staff_profiles?select=auth_user_id,minecraft_username,linked_player_id,role`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),
      requestJson(`${base}/rest/v1/players?select=id,name`,{headers:{apikey:service,Authorization:`Bearer ${service}`}})
    ]);
    const profileById=new Map((profiles||[]).map(p=>[String(p.auth_user_id),p]));
    const playerById=new Map((players||[]).map(p=>[String(p.id),p.name]));
    const users=(authData?.users||[]).filter(u=>{const email=String(u.email||'').toLowerCase();return roles.owners.has(email)||roles.admins.has(email)||roles.testers.has(email)}).map(u=>{
      const email=String(u.email||'').toLowerCase();const profile=profileById.get(String(u.id))||{};const role=roles.owners.has(email)?'owner':roles.testers.has(email)?'tester':'admin';
      return{id:u.id,email,username:profile.minecraft_username||email,linked_player_id:profile.linked_player_id||null,linked_player_name:profile.linked_player_id?(playerById.get(String(profile.linked_player_id))||null):null,confirmed:Boolean(u.email_confirmed_at),created_at:u.created_at||null,role};
    });
    return res.status(200).json({users});
  }catch(error){console.error('list-staff',error);return res.status(error.status||500).json({error:error.message||'Could not list staff accounts'})}
};
