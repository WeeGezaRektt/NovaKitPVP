require('dotenv').config();

const http = require('http');
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const WEBSITE = String(process.env.NOVA_WEBSITE_URL || '').replace(/\/+$/, '');
const SYNC_SECRET = process.env.DISCORD_SYNC_SECRET;
const PORT = Number(process.env.PORT || 3000);

for (const [name, value] of Object.entries({
  DISCORD_BOT_TOKEN: TOKEN,
  DISCORD_CLIENT_ID: CLIENT_ID,
  DISCORD_GUILD_ID: GUILD_ID,
  NOVA_WEBSITE_URL: WEBSITE,
  DISCORD_SYNC_SECRET: SYNC_SECRET
})) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const MODE_ALIASES = new Map([
  ['sword', 'sword'],
  ['mace', 'mace'],
  ['vanilla', 'vanilla'],
  ['spearmace', 'spearmace'],
  ['spear mace', 'spearmace'],
  ['searmace', 'spearmace'], // handles the HT5 SearMace typo shown in your roles
  ['diasmp', 'diasmp'],
  ['dia smp', 'diasmp'],
  ['nethpot', 'nethpot'],
  ['neth pot', 'nethpot'],
  ['diapot', 'diapot'],
  ['dia pot', 'diapot'],
  ['cart', 'cart'],
  ['uhc', 'uhc'],
  ['nethsmp', 'nethsmp'],
  ['neth smp', 'nethsmp']
]);

const MODE_LABELS = {
  sword: 'Sword',
  mace: 'Mace',
  vanilla: 'Vanilla',
  spearmace: 'SpearMace',
  diasmp: 'DiaSMP',
  nethpot: 'NethPOT',
  diapot: 'DiaPOT',
  cart: 'Cart',
  uhc: 'UHC',
  nethsmp: 'NethSMP'
};

function parseTierRole(roleName) {
  const match = String(roleName || '').trim().match(/^(HT|LT)([1-5])\s+(.+)$/i);
  if (!match) return null;

  const tier = `${match[1].toUpperCase()}${match[2]}`;
  const rawKit = match[3].trim().toLowerCase().replace(/\s+/g, ' ');
  const gamemode = MODE_ALIASES.get(rawKit);
  if (!gamemode) return null;

  return { tier, gamemode, roleName };
}

async function api(path, payload) {
  const response = await fetch(`${WEBSITE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nova-discord-secret': SYNC_SECRET
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Nova API failed (${response.status})`);
    error.status = response.status;
    error.code = body.code;
    throw error;
  }
  return body;
}

function memberTierRoles(member) {
  const result = [];
  for (const role of member.roles.cache.values()) {
    const parsed = parseTierRole(role.name);
    if (parsed) result.push(parsed);
  }
  return result;
}

function fullSyncUpdates(member) {
  const grouped = new Map();
  for (const parsed of memberTierRoles(member)) {
    if (!grouped.has(parsed.gamemode)) grouped.set(parsed.gamemode, []);
    grouped.get(parsed.gamemode).push(parsed);
  }

  const updates = [];
  const conflicts = [];

  for (const [gamemode, rows] of grouped) {
    if (rows.length === 1) updates.push(rows[0]);
    else if (rows.length > 1) {
      conflicts.push({
        gamemode,
        roles: rows.map(x => x.roleName)
      });
    }
  }

  return { updates, conflicts };
}

const commands = [
  new SlashCommandBuilder()
    .setName('novalink')
    .setDescription('Link a Discord member to a NovaKitPVP Minecraft player')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o =>
      o.setName('member').setDescription('Discord member').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('minecraft').setDescription('Exact NovaKitPVP player name').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('novasync')
    .setDescription('Sync all current tier roles for a linked member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o =>
      o.setName('member').setDescription('Discord member').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('novaunlink')
    .setDescription('Remove a Discord-to-NovaKitPVP player link')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o =>
      o.setName('member').setDescription('Discord member').setRequired(true)
    )
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`Nova Sync logged in as ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.commands.set(commands);
    console.log(`Registered ${commands.length} Nova commands in ${guild.name}`);
  } catch (error) {
    console.error('Could not register guild commands:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.guildId !== GUILD_ID) return;

  try {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.options.getUser('member', true);
    const member = await interaction.guild.members.fetch(user.id);

    if (interaction.commandName === 'novalink') {
      const minecraftName = interaction.options.getString('minecraft', true).trim();

      const linked = await api('/api/discord-link', {
        discordUserId: user.id,
        minecraftName
      });

      const { updates, conflicts } = fullSyncUpdates(member);
      let synced = 0;

      if (updates.length) {
        const result = await api('/api/discord-sync', {
          discordUserId: user.id,
          updates
        });
        synced = result.updates?.length || updates.length;
      }

      const conflictText = conflicts.length
        ? `\n⚠️ Skipped conflicting kits: ${conflicts.map(c => MODE_LABELS[c.gamemode]).join(', ')}`
        : '';

      await interaction.editReply(
        `✅ Linked **${user.username}** → **${linked.player.name}**.\n` +
        `Synced ${synced} current tier role${synced === 1 ? '' : 's'}.${conflictText}`
      );
      return;
    }

    if (interaction.commandName === 'novasync') {
      const { updates, conflicts } = fullSyncUpdates(member);

      if (!updates.length) {
        await interaction.editReply(
          conflicts.length
            ? '⚠️ I found tier-role conflicts but no safe roles to sync.'
            : 'No Nova tier roles were found on that member.'
        );
        return;
      }

      const result = await api('/api/discord-sync', {
        discordUserId: user.id,
        updates
      });

      const conflictText = conflicts.length
        ? `\n⚠️ Skipped conflicting kits: ${conflicts.map(c => MODE_LABELS[c.gamemode]).join(', ')}`
        : '';

      await interaction.editReply(
        `✅ Synced **${result.player.name}** from ${result.updates.length} tier role${result.updates.length === 1 ? '' : 's'}.${conflictText}`
      );
      return;
    }

    if (interaction.commandName === 'novaunlink') {
      const result = await api('/api/discord-unlink', {
        discordUserId: user.id
      });
      await interaction.editReply(`✅ Unlinked **${user.username}** from **${result.player.name}**.`);
    }
  } catch (error) {
    console.error('Command error:', error);
    const message = error.code === 'NOT_LINKED'
      ? 'That Discord member is not linked yet. Use `/novalink` first.'
      : `❌ ${error.message}`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

// Aggregate newly-added tier roles briefly. This avoids catching the role swap
// halfway through when the TierList bot removes one role and adds another.
const pending = new Map();

client.on('guildMemberUpdate', (oldMember, newMember) => {
  if (newMember.guild.id !== GUILD_ID) return;

  const added = [];
  for (const role of newMember.roles.cache.values()) {
    if (oldMember.roles.cache.has(role.id)) continue;
    const parsed = parseTierRole(role.name);
    if (parsed) added.push(parsed);
  }

  if (!added.length) return;

  let state = pending.get(newMember.id);
  if (!state) {
    state = { updates: new Map(), timer: null };
    pending.set(newMember.id, state);
  }

  // A newly-added role is authoritative for that kit. Other kit roles stay active.
  for (const update of added) {
    state.updates.set(update.gamemode, update);
  }

  clearTimeout(state.timer);
  state.timer = setTimeout(async () => {
    pending.delete(newMember.id);
    const updates = [...state.updates.values()];
    if (!updates.length) return;

    try {
      const result = await api('/api/discord-sync', {
        discordUserId: newMember.id,
        updates
      });

      console.log(
        `Synced ${result.player.name}: ` +
        result.updates.map(x => `${MODE_LABELS[x.gamemode]}=${x.after.active}`).join(', ')
      );
    } catch (error) {
      if (error.code === 'NOT_LINKED' || error.status === 404) {
        console.log(`Tier role changed for unlinked Discord user ${newMember.user.tag}; ignoring.`);
      } else {
        console.error(`Auto-sync failed for ${newMember.user.tag}:`, error);
      }
    }
  }, 1500);
});

client.on('error', error => console.error('Discord client error:', error));

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    service: 'NovaKitPVP Discord Sync',
    discordReady: client.isReady()
  }));
}).listen(PORT, () => {
  console.log(`Health server listening on port ${PORT}`);
});

client.login(TOKEN);
