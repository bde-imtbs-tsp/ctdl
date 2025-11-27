require('dotenv').config();

const { Client, GatewayIntentBits, ChannelType, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, REST, Routes, SlashCommandBuilder } = require('discord.js');
const knexConfig = require('./knexfile');

const knex = require('knex')(knexConfig.development);

const token = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const tempChannels = new Map();

const commands = [
    new SlashCommandBuilder()
        .setName('add-team')
        .setDescription('Ajoute une équipe')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addStringOption(option =>
            option.setName('label')
                .setDescription('Nom de l\'équipe')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Rôle Discord')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('remove-team')
        .setDescription('Supprime une équipe')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addStringOption(option =>
            option.setName('label')
                .setDescription('Nom de l\'équipe')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('list-teams')
        .setDescription('Liste les équipes')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    new SlashCommandBuilder()
        .setName('add-channel')
        .setDescription('Ajoute un salon de déclenchement')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Salon vocal')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('remove-channel')
        .setDescription('Supprime un salon de déclenchement')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Salon à supprimer')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('list-channels')
        .setDescription('Liste les salons')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    new SlashCommandBuilder()
        .setName('setup-inscription')
        .setDescription('Envoie le formulaire d\'inscription')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Salon où envoyer le formulaire')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role_inscrit')
                .setDescription('Rôle "Inscrit" à donner')
                .setRequired(true))
].map(command => command.toJSON());

client.once('ready', async () => {
    try {
        await knex.migrate.latest();
        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`Connecté: ${client.user.tag}`);
    } catch (error) {
        console.error('Erreur:', error);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const channels = await knex('trigger_channels').select('channel_id');
    const triggerChannelIds = channels.map(ch => ch.channel_id);

    if (newState.channelId && triggerChannelIds.includes(newState.channelId)) {
        const member = newState.member;
        const guild = newState.guild;
        const triggerChannel = newState.channel;
        const category = triggerChannel.parent;

        try {
            const newChannel = await guild.channels.create({
                name: `Salon de ${member.displayName}`,
                type: ChannelType.GuildVoice,
                parent: category,
                permissionOverwrites: [
                    {
                        id: member.id,
                        allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.DeafenMembers],
                    },
                    {
                        id: guild.roles.everyone,
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    }
                ],
            });

            await member.voice.setChannel(newChannel);
            tempChannels.set(newChannel.id, member.id);
        } catch (error) {
            console.error("Erreur:", error);
        }
    }

    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const channelToDelete = await oldState.guild.channels.fetch(oldState.channelId);

        if (channelToDelete && channelToDelete.members.size === 0) {
            await channelToDelete.delete();
            tempChannels.delete(oldState.channelId);
        }
    }
});

async function createInscriptionMessage(channel) {
    const teams = await knex('teams').select('*');

    if (teams.length === 0) {
        return null;
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_team')
                .setPlaceholder('Choisissez votre équipe')
                .addOptions(
                    teams.map(team => ({
                        label: team.label,
                        value: team.id.toString(),
                    }))
                ),
        );

    return await channel.send({
        content: 'Choisissez votre équipe pour vous inscrire.',
        components: [row]
    });
}

async function updateInscriptionMessages() {
    const messages = await knex('inscription_messages').select('*');
    const teams = await knex('teams').select('*');

    if (teams.length === 0) {
        return;
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_team')
                .setPlaceholder('Choisissez votre équipe')
                .addOptions(
                    teams.map(team => ({
                        label: team.label,
                        value: team.id.toString(),
                    }))
                ),
        );

    for (const msg of messages) {
        try {
            const channel = await client.channels.fetch(msg.channel_id);
            const message = await channel.messages.fetch(msg.message_id);
            await message.edit({
                content: 'Choisissez votre équipe pour vous inscrire.',
                components: [row]
            });
        } catch (error) {
            console.error('Erreur mise à jour message:', error);
        }
    }
}

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'add-team') {
            const label = interaction.options.getString('label');
            const role = interaction.options.getRole('role');

            try {
                await knex('teams').insert({ label: label, role_id: role.id });
                await updateInscriptionMessages();
                await interaction.reply({ content: `Équipe **${label}** ajoutée`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }

        if (interaction.commandName === 'add-channel') {
            const channel = interaction.options.getChannel('channel');

            try {
                await knex('trigger_channels').insert({ channel_id: channel.id });
                await interaction.reply({ content: `Salon <#${channel.id}> ajouté`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }

        if (interaction.commandName === 'list-teams') {
            const teams = await knex('teams').select('*');
            if (teams.length === 0) {
                await interaction.reply({ content: 'Aucune équipe', ephemeral: true });
            } else {
                const list = teams.map(t => `• **${t.label}** - <@&${t.role_id}>`).join('\n');
                await interaction.reply({ content: `**Équipes:**\n${list}`, ephemeral: true });
            }
        }

        if (interaction.commandName === 'list-channels') {
            const channels = await knex('trigger_channels').select('*');
            if (channels.length === 0) {
                await interaction.reply({ content: 'Aucun salon', ephemeral: true });
            } else {
                const list = await Promise.all(channels.map(async (c) => {
                    try {
                        const channel = await interaction.guild.channels.fetch(c.channel_id);
                        const categoryName = channel.parent ? ` - ${channel.parent.name}` : '';
                        return `• <#${c.channel_id}>${categoryName}`;
                    } catch {
                        return `• <#${c.channel_id}>`;
                    }
                }));
                await interaction.reply({ content: `**Salons:**\n${list.join('\n')}`, ephemeral: true });
            }
        }

        if (interaction.commandName === 'remove-channel') {
            const channel = interaction.options.getChannel('channel');

            try {
                const result = await knex('trigger_channels').where('channel_id', channel.id).delete();
                if (result > 0) {
                    await interaction.reply({ content: `Salon <#${channel.id}> supprimé`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `Salon <#${channel.id}> non trouvé`, ephemeral: true });
                }
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }

        if (interaction.commandName === 'remove-team') {
            const label = interaction.options.getString('label');

            try {
                const result = await knex('teams').where('label', label).delete();
                if (result > 0) {
                    await updateInscriptionMessages();
                    await interaction.reply({ content: `Équipe **${label}** supprimée`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `Équipe **${label}** non trouvée`, ephemeral: true });
                }
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }

        if (interaction.commandName === 'setup-inscription') {
            const channel = interaction.options.getChannel('channel');
            const roleInscrit = interaction.options.getRole('role_inscrit');

            try {
                const teams = await knex('teams').select('*');
                if (teams.length === 0) {
                    await interaction.reply({ content: 'Aucune équipe configurée', ephemeral: true });
                    return;
                }

                const message = await createInscriptionMessage(channel);
                if (message) {
                    await knex('inscription_messages').insert({
                        channel_id: channel.id,
                        message_id: message.id,
                        inscrit_role_id: roleInscrit ? roleInscrit.id : null
                    });
                    await interaction.reply({ content: `Formulaire envoyé dans <#${channel.id}>`, ephemeral: true });
                }
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_team') {
            const selectedTeamId = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`modal_minecraft_pseudo_${selectedTeamId}`)
                .setTitle('Inscription Minecraft');

            const pseudoInput = new TextInputBuilder()
                .setCustomId('pseudoInput')
                .setLabel("Pseudo Minecraft")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(pseudoInput));
            await interaction.showModal(modal);
        }
    } else if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId.startsWith('modal_minecraft_pseudo_')) {
            const selectedTeamId = interaction.customId.split('modal_minecraft_pseudo_')[1];
            const pseudo = interaction.fields.getTextInputValue('pseudoInput');
            const discordId = interaction.user.id;

            const team = await knex('teams').where('id', parseInt(selectedTeamId)).first();

            if (team) {
                try {
                    await knex('users')
                        .insert({ discord_id: discordId, minecraft_username: pseudo, team_id: team.id })
                        .onConflict('discord_id')
                        .merge();

                    const inscriptionMsg = await knex('inscription_messages')
                        .where('channel_id', interaction.channel.id)
                        .first();

                    const rolesToAdd = [];

                    const teamRole = interaction.guild.roles.cache.get(team.role_id);
                    if (teamRole) rolesToAdd.push(teamRole);

                    if (inscriptionMsg && inscriptionMsg.inscrit_role_id) {
                        const inscritRole = interaction.guild.roles.cache.get(inscriptionMsg.inscrit_role_id);
                        if (inscritRole) rolesToAdd.push(inscritRole);
                    }

                    if (rolesToAdd.length > 0) {
                        await interaction.member.roles.add(rolesToAdd);
                        await interaction.reply({ content: `Inscrit dans **${team.label}** avec le pseudo **${pseudo}**`, ephemeral: true });
                    } else {
                        await interaction.reply({ content: `Erreur: Rôle introuvable`, ephemeral: true });
                    }
                } catch (err) {
                    await interaction.reply({ content: `Erreur: ${err.message}`, ephemeral: true });
                }
            } else {
                await interaction.reply({ content: `Erreur: Équipe invalide`, ephemeral: true });
            }
        }
    }
});

client.login(token);
