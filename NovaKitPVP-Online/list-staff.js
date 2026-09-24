const OWNER_EMAILS = new Set(['geraldmcbride60@gmail.com','poppymacedu@gmail.com']);
const OWNER_NAMES = {
  'geraldmcbride60@gmail.com':'WeeGezaRektt',
  'poppymacedu@gmail.com':'PoppyMacedU'
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

async function requireOwner(req) {
  const base = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const bearer = String(req.headers.authorization || '');
  if (!base || !anon) throw Object.assign(new Error('Supabase is not configured'), { status: 503 });
  if (!bearer.startsWith('Bearer ')) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  const user = await requestJson(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: bearer } });
  const email = String(user?.email || '').trim().toLowerCase();
  if (!OWNER_EMAILS.has(email)) throw Object.assign(new Error('Owner access required'), { status: 403 });
  return user;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const base = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !service) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel' });

  try {
    await requireOwner(req);

    const [authData, approved, profiles] = await Promise.all([
      requestJson(`${base}/auth/v1/admin/users?page=1&per_page=1000`, { headers: { apikey: service, Authorization: `Bearer ${service}` } }),
      requestJson(`${base}/rest/v1/admin_emails?select=email`, { headers: { apikey: service, Authorization: `Bearer ${service}` } }),
      requestJson(`${base}/rest/v1/staff_profiles?select=auth_user_id,minecraft_username`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })
    ]);

    const approvedSet = new Set((approved || []).map(x => String(x.email || '').toLowerCase()));
    const nameById = new Map((profiles || []).map(x => [String(x.auth_user_id), String(x.minecraft_username || '')]));

    const users = (authData?.users || []).filter(u => {
      const email = String(u.email || '').toLowerCase();
      return OWNER_EMAILS.has(email) || approvedSet.has(email);
    }).map(u => {
      const email = String(u.email || '').toLowerCase();
      return {
        id: u.id,
        email,
        username: nameById.get(String(u.id)) || OWNER_NAMES[email] || email,
        confirmed: Boolean(u.email_confirmed_at),
        created_at: u.created_at || null,
        role: OWNER_EMAILS.has(email) ? 'owner' : 'admin'
      };
    });

    return res.status(200).json({ users });
  } catch (error) {
    console.error('list-staff', error);
    return res.status(error.status || 500).json({ error: error.message || 'Could not list staff accounts' });
  }
};
