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
}module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const base=process.env.SUPABASE_URL;
  const anon=process.env.SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!anon||!service) return res.status(503).json({error:'Supabase service settings are not configured'});

  try{
    await requireOwner(req,base,anon,service);

    const [authData, owners, admins, testers, profiles, players] = await Promise.all([
      requestJson(`${base}/auth/v1/admin/users?page=1&per_page=1000`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),
      requestJson(`${base}/rest/v1/owner_emails?select=email`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),
      requestJson(`${base}/rest/v1/admin_emails?select=email`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),
      requestJson(`${base}/rest/v1/tester_emails?select=email`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),
      requestJson(`${base}/rest/v1/staff_profiles?select=auth_user_id,minecraft_username,linked_player_id,role`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),
      requestJson(`${base}/rest/v1/players?select=id,name`,{headers:{apikey:service,Authorization:`Bearer ${service}`}})
    ]);

    const ownerSet=new Set((owners||[]).map(x=>String(x.email||'').toLowerCase()));
    const adminSet=new Set((admins||[]).map(x=>String(x.email||'').toLowerCase()));
    const testerSet=new Set((testers||[]).map(x=>String(x.email||'').toLowerCase()));
    const profileById=new Map((profiles||[]).map(x=>[String(x.auth_user_id),x]));
    const playerById=new Map((players||[]).map(x=>[String(x.id),x.name]));

    const users=(authData?.users||[])
      .filter(u=>{
        const email=String(u.email||'').toLowerCase();
        return ownerSet.has(email)||adminSet.has(email)||testerSet.has(email);
      })
      .map(u=>{
        const email=String(u.email||'').toLowerCase();
        const profile=profileById.get(String(u.id))||{};
        return {
          id:u.id,
          email,
          username:profile.minecraft_username||'',
          confirmed:Boolean(u.email_confirmed_at),
          created_at:u.created_at||null,
          role:ownerSet.has(email)?'owner':testerSet.has(email)?'tester':'admin',
          linked_player_id:profile.linked_player_id||null,
          linked_player_name:profile.linked_player_id?playerById.get(String(profile.linked_player_id))||null:null
        };
      });

    return res.status(200).json({users});
  }catch(error){
    console.error('list-staff',error);
    return res.status(error.status||500).json({error:error.message||'Could not list staff accounts'});
  }
};
