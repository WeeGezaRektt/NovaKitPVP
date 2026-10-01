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
  if (!bearer.startsWith('Bearer ')) {
    throw Object.assign(new Error('Not authenticated'), { status: 401 });
  }

  const user = await requestJson(`${base}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: bearer }
  });

  const email = String(user?.email || '').trim().toLowerCase();

  const rows = await requestJson(
    `${base}/rest/v1/owner_emails?email=eq.${encodeURIComponent(email)}&select=email&limit=1`,
    { headers: { apikey: service, Authorization: `Bearer ${service}` } }
  );

  if (!rows?.length) {
    throw Object.assign(new Error('Owner access required'), { status: 403 });
  }

  return user;
}module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const base = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !anon || !service) {
    return res.status(503).json({ error: 'Supabase service settings are not configured' });
  }

  try {
    const owner = await requireOwner(req, base, anon, service);

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const username = String(req.body?.username || '').trim();
    const role = req.body?.role === 'tester' ? 'tester' : 'admin';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 8-128 characters' });
    }
    if (!/^[A-Za-z0-9_.-]{2,32}$/.test(username)) {
      return res.status(400).json({ error: 'Enter a valid staff username' });
    }

    const [owners, admins, testers] = await Promise.all([
      requestJson(`${base}/rest/v1/owner_emails?select=email`, {
        headers: { apikey: service, Authorization: `Bearer ${service}` }
      }),
      requestJson(`${base}/rest/v1/admin_emails?select=email`, {
        headers: { apikey: service, Authorization: `Bearer ${service}` }
      }),
      requestJson(`${base}/rest/v1/tester_emails?select=email`, {
        headers: { apikey: service, Authorization: `Bearer ${service}` }
      })
    ]);

    const allStaff = new Set([
      ...(owners || []).map(x => String(x.email || '').toLowerCase()),
      ...(admins || []).map(x => String(x.email || '').toLowerCase()),
      ...(testers || []).map(x => String(x.email || '').toLowerCase())
    ]);

    if (allStaff.has(email)) {
      return res.status(409).json({ error: 'That email is already a staff account' });
    }

    const players = await requestJson(`${base}/rest/v1/players?select=id,name&limit=1000`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` }
    });

    const wanted = username.toLowerCase();
    const dotVariant = wanted.startsWith('.') ? wanted.slice(1) : `.${wanted}`;

    const linked = (players || []).find(p => String(p.name || '').toLowerCase() === wanted)
      || (players || []).find(p => String(p.name || '').toLowerCase() === dotVariant)
      || null;

    if (role === 'tester' && !linked) {
      return res.status(400).json({
        error: 'Tester username must match an existing tierlist player'
      });
    }

    const created = await requestJson(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true
      })
    });

    const table = role === 'tester' ? 'tester_emails' : 'admin_emails';

    await requestJson(`${base}/rest/v1/${table}?on_conflict=email`, {
      method: 'POST',
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ email })
    });

    await requestJson(`${base}/rest/v1/staff_profiles?on_conflict=auth_user_id`, {
      method: 'POST',
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        auth_user_id: created.id,
        minecraft_uuid: null,
        minecraft_username: username,
        linked_player_id: linked?.id || null,
        role: role === 'tester' ? 'tester' : 'tier_staff',
        verified: true,
        linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });

    await requestJson(`${base}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        actor_auth_user_id: owner.id,
        actor_minecraft_username: owner.email,
        action: 'ADMIN_ACCOUNT_CREATED',
        change: {
          email,
          username,
          role,
          linked_player_id: linked?.id || null
        }
      })
    });

    return res.status(200).json({
      ok: true,
      id: created.id,
      email,
      username,
      role
    });
  } catch (error) {
    console.error('create-admin', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Could not create staff account'
    });
  }
};
