async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

async function requireOwner(req, base, anon, service) {
  const bearer = String(req.headers.authorization || '');
  if (!bearer.startsWith('Bearer ')) throw Object.assign(new Error('Not authenticated'), { status: 401 });

  const user = await requestJson(`${base}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: bearer }
  });

  const owners = await requestJson(`${base}/rest/v1/owner_emails?select=email`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` }
  });
  const ownerSet = new Set((owners || []).map(x => String(x.email || '').trim().toLowerCase()));

  if (!ownerSet.has(String(user?.email || '').trim().toLowerCase())) {
    throw Object.assign(new Error('Owner access required'), { status: 403 });
  }
  return { user, ownerSet };
}

module.exports = { requestJson, requireOwner };
