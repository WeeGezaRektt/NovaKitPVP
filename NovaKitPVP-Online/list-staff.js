const { requestJson, requireOwner } = require('../lib/owner-auth');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !anon || !service) return res.status(503).json({ error: 'Supabase service settings are not configured' });
  try {
    const { ownerSet } = await requireOwner(req, base, anon, service);
    const [authData, admins, profiles] = await Promise.all([
      requestJson(`${base}/auth/v1/admin/users?page=1&per_page=1000`, { headers: { apikey: service, Authorization: `Bearer ${service}` } }),
      requestJson(`${base}/rest/v1/admin_emails?select=email`, { headers: { apikey: service, Authorization: `Bearer ${service}` } }),
      requestJson(`${base}/rest/v1/staff_profiles?select=auth_user_id,minecraft_username`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })
    ]);
    const adminSet = new Set((admins || []).map(x => String(x.email || '').toLowerCase()));
    const names = new Map((profiles || []).map(x => [String(x.auth_user_id), String(x.minecraft_username || '')]));
    const users = (authData?.users || []).filter(u => {
      const email = String(u.email || '').toLowerCase();
      return ownerSet.has(email) || adminSet.has(email);
    }).map(u => {
      const email = String(u.email || '').toLowerCase();
      return { id:u.id, email, username:names.get(String(u.id)) || email, confirmed:Boolean(u.email_confirmed_at), created_at:u.created_at || null, role:ownerSet.has(email)?'owner':'admin' };
    });
    return res.status(200).json({ users });
  } catch (error) {
    console.error('list-staff', error);
    return res.status(error.status || 500).json({ error: error.message || 'Could not list staff accounts' });
  }
};
