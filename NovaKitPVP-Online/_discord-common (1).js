const crypto = require('crypto');

function json(res, status, body) {
  res.status(status).json(body);
}

function validSecret(req) {
  const expected = String(process.env.DISCORD_SYNC_SECRET || '');
  const supplied = String(req.headers['x-nova-discord-secret'] || '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function env() {
  const base = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !service) throw new Error('Supabase service settings are not configured');
  return { base, service };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    const error = new Error(message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function serviceHeaders(service, extra = {}) {
  return {
    apikey: service,
    Authorization: `Bearer ${service}`,
    ...extra
  };
}

async function audit(base, service, action, change) {
  try {
    await requestJson(`${base}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: serviceHeaders(service, {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify({
        actor_auth_user_id: null,
        actor_minecraft_username: 'Nova Discord Sync',
        action,
        change
      })
    });
  } catch (error) {
    console.warn('Could not write Discord sync audit event', error.message);
  }
}

module.exports = { json, validSecret, env, requestJson, serviceHeaders, audit };
