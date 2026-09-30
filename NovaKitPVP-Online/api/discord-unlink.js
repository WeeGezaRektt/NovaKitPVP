const { json, validSecret, env, requestJson, serviceHeaders, audit } = require('./_discord-common');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!validSecret(req)) return json(res, 401, { error: 'Invalid Discord sync secret' });

  try {
    const { base, service } = env();
    const discordUserId = String(req.body?.discordUserId || '').trim();

    if (!/^\d{15,22}$/.test(discordUserId)) {
      return json(res, 400, { error: 'Invalid Discord user ID' });
    }

    const rows = await requestJson(
      `${base}/rest/v1/players?discord_user_id=eq.${encodeURIComponent(discordUserId)}&select=id,name,discord_user_id&limit=1`,
      { headers: serviceHeaders(service) }
    );

    const player = rows?.[0];
    if (!player) return json(res, 404, { error: 'That Discord account is not linked' });

    await requestJson(`${base}/rest/v1/players?id=eq.${encodeURIComponent(player.id)}`, {
      method: 'PATCH',
      headers: serviceHeaders(service, {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify({ discord_user_id: null })
    });

    await audit(base, service, 'DISCORD_PLAYER_UNLINKED', {
      player_id: player.id,
      player_name: player.name,
      discord_user_id: discordUserId
    });

    return json(res, 200, { ok: true, player: { id: player.id, name: player.name } });
  } catch (error) {
    console.error('discord-unlink', error);
    return json(res, error.status || 500, {
      error: error.message || 'Could not unlink Discord account'
    });
  }
};
