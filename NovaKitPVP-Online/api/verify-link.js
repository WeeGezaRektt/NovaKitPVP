const OWNER_NAMES = new Set(['weegezarektt', 'poppymacedu']);

function cleanName(value) {
  return String(value || '').trim();
}

async function sbFetch(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !service) throw new Error('Supabase service environment variables are missing');
  const headers = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expected = process.env.MINECRAFT_LINK_SECRET;
  const supplied = req.headers['x-nova-link-secret'];
  if (!expected || !supplied || supplied !== expected) return res.status(401).json({ error: 'Invalid server secret' });

  const code = String(req.body?.code || '').trim().toUpperCase();
  const uuid = String(req.body?.uuid || '').replace(/-/g, '').toLowerCase();
  const username = cleanName(req.body?.username);
  if (!/^NOVA-[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'Invalid link code' });
  if (!/^[0-9a-f]{32}$/.test(uuid)) return res.status(400).json({ error: 'Invalid Minecraft UUID' });
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return res.status(400).json({ error: 'Invalid Minecraft username' });

  try {
    const now = new Date().toISOString();
    const rows = await sbFetch(`/rest/v1/link_requests?select=id,auth_user_id,expires_at,used_at&code=eq.${encodeURIComponent(code)}&used_at=is.null&expires_at=gt.${encodeURIComponent(now)}&limit=1`);
    const request = Array.isArray(rows) ? rows[0] : null;
    if (!request) return res.status(404).json({ error: 'Link code is invalid or expired' });

    // A Minecraft identity can only be linked to one website account.
    const existing = await sbFetch(`/rest/v1/staff_profiles?select=auth_user_id,minecraft_username&minecraft_uuid=eq.${encodeURIComponent(uuid)}&limit=1`);
    if (Array.isArray(existing) && existing.length && existing[0].auth_user_id !== request.auth_user_id) {
      return res.status(409).json({ error: 'That Minecraft account is already linked to another staff account.' });
    }

    const role = OWNER_NAMES.has(username.toLowerCase()) ? 'owner' : 'tier_staff';
    const profile = {
      auth_user_id: request.auth_user_id,
      minecraft_uuid: uuid,
      minecraft_username: username,
      role,
      verified: true,
      linked_at: now,
      updated_at: now
    };

    await sbFetch('/rest/v1/staff_profiles?on_conflict=auth_user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(profile)
    });

    await sbFetch(`/rest/v1/link_requests?id=eq.${encodeURIComponent(request.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ used_at: now })
    });

    // Store only non-sensitive display metadata in Supabase Auth.
    await sbFetch(`/auth/v1/admin/users/${request.auth_user_id}`, {
      method: 'PUT',
      body: JSON.stringify({ user_metadata: { minecraft_username: username, minecraft_uuid: uuid, nova_role: role } })
    });

    return res.status(200).json({ ok: true, username, role });
  } catch (error) {
    console.error('verify-link', error);
    return res.status(500).json({ error: 'Could not verify Minecraft account' });
  }
};
