const { json, validSecret, env, requestJson, serviceHeaders, audit } = require('./_discord-common');

const POINTS = {
  HT1: 60, LT1: 45,
  HT2: 30, LT2: 20,
  HT3: 10, LT3: 6,
  HT4: 4,  LT4: 3,
  HT5: 2,  LT5: 1
};

const MODES = new Set([
  'sword','mace','vanilla','spearmace','diasmp',
  'nethpot','diapot','cart','uhc','nethsmp'
]);

function bestTier(...tiers) {
  return tiers
    .filter(t => t && t !== 'Unranked' && POINTS[t] != null)
    .sort((a, b) => POINTS[b] - POINTS[a])[0] || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!validSecret(req)) return json(res, 401, { error: 'Invalid Discord sync secret' });

  try {
    const { base, service } = env();
    const discordUserId = String(req.body?.discordUserId || '').trim();
    const input = Array.isArray(req.body?.updates) ? req.body.updates : [];

    if (!/^\d{15,22}$/.test(discordUserId)) {
      return json(res, 400, { error: 'Invalid Discord user ID' });
    }

    const updatesByMode = new Map();
    for (const row of input) {
      const gamemode = String(row?.gamemode || '').trim().toLowerCase();
      const tier = String(row?.tier || '').trim().toUpperCase();
      if (!MODES.has(gamemode) || POINTS[tier] == null) continue;
      updatesByMode.set(gamemode, { gamemode, tier, roleName: row?.roleName || null });
    }

    if (!updatesByMode.size) {
      return json(res, 400, { error: 'No valid tier updates were supplied' });
    }

    const linked = await requestJson(
      `${base}/rest/v1/players?discord_user_id=eq.${encodeURIComponent(discordUserId)}&select=id,name,discord_user_id&limit=1`,
      { headers: serviceHeaders(service) }
    );
    const player = linked?.[0];

    if (!player) {
      return json(res, 404, {
        error: 'Discord account is not linked to a NovaKitPVP player',
        code: 'NOT_LINKED'
      });
    }

    const existing = await requestJson(
      `${base}/rest/v1/player_tiers?player_id=eq.${encodeURIComponent(player.id)}&select=id,gamemode,active_tier,peak_tier,retired_tier`,
      { headers: serviceHeaders(service) }
    );
    const existingByMode = new Map((existing || []).map(r => [r.gamemode, r]));

    const now = new Date().toISOString();
    const upserts = [];
    const auditChanges = [];

    for (const { gamemode, tier, roleName } of updatesByMode.values()) {
      const before = existingByMode.get(gamemode) || {
        active_tier: 'Unranked',
        peak_tier: null,
        retired_tier: null
      };

      // If they are downgraded later, their previous strongest active tier
      // is preserved as Peak. This matches NovaKitPVP's peak-points system.
      const peak = bestTier(before.peak_tier, before.active_tier, tier);

      upserts.push({
        player_id: player.id,
        gamemode,
        active_tier: tier,
        peak_tier: peak,
        retired_tier: before.retired_tier || null,
        updated_at: now
      });

      auditChanges.push({
        gamemode,
        role_name: roleName,
        before: {
          active: before.active_tier || 'Unranked',
          peak: before.peak_tier || null
        },
        after: {
          active: tier,
          peak
        }
      });
    }

    await requestJson(`${base}/rest/v1/player_tiers?on_conflict=player_id,gamemode`, {
      method: 'POST',
      headers: serviceHeaders(service, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      }),
      body: JSON.stringify(upserts)
    });

    await audit(base, service, 'DISCORD_TIER_SYNC', {
      player_id: player.id,
      player_name: player.name,
      discord_user_id: discordUserId,
      updates: auditChanges
    });

    return json(res, 200, {
      ok: true,
      player: { id: player.id, name: player.name },
      updates: auditChanges
    });
  } catch (error) {
    console.error('discord-sync', error);
    return json(res, error.status || 500, {
      error: error.message || 'Could not sync Discord tiers'
    });
  }
};
