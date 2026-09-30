const { json, validSecret, env, requestJson, serviceHeaders, audit } = require('./_discord-common');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!validSecret(req)) return json(res, 401, { error: 'Invalid Discord sync secret' });

  try {
    const { base, service } = env();
    const discordUserId = String(req.body?.discordUserId || '').trim();
    const minecraftName = String(req.body?.minecraftName || '').trim();

    if (!/^\d{15,22}$/.test(discordUserId)) {
      return json(res, 400, { error: 'Invalid Discord user ID' });
    }
    if (!minecraftName || minecraftName.length > 40) {
      return json(res, 400, { error: 'Enter a valid Minecraft username' });
    }

    const players = await requestJson(`${base}/rest/v1/players?select=id,name,discord_user_id&limit=1000`, {
      headers: serviceHeaders(service)
    });

    const target = (players || []).find(
      p => String(p.name || '').toLowerCase() === minecraftName.toLowerCase()
    );
    if (!target) {
      return json(res, 404, { error: `No NovaKitPVP player named ${minecraftName}` });
    }

    const conflict = (players || []).find(
      p => p.discord_user_id === discordUserId && p.id !== target.id
    );
    if (conflict) {
      return json(res, 409, {
        error: `That Discord account is already linked to ${conflict.name}`
      });
    }

    await requestJson(`${base}/rest/v1/players?id=eq.${encodeURIComponent(target.id)}`, {
      method: 'PATCH',
      headers: serviceHeaders(service, {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify({ discord_user_id: discordUserId })
    });

    await audit(base, service, 'DISCORD_PLAYER_LINKED', {
      player_id: target.id,
      player_name: target.name,
      discord_user_id: discordUserId
    });

    return json(res, 200, {
      ok: true,
      player: { id: target.id, name: target.name },
      discordUserId
    });
  } catch (error) {
    console.error('discord-link', error);
    return json(res, error.status || 500, {
      error: error.message || 'Could not link Discord account'
    });
  }
};
