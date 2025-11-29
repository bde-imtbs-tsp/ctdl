const { SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder, ChannelType } = require('discord.js');
const { sendMinecraftCommand } = require('../utils/pterodactyl');

async function updateInscriptionMessages(knex, client) {
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('team')
        .setDescription('Gère les équipes')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Liste les équipes'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ajoute une équipe')
                .addStringOption(option =>
                    option.setName('nom')
                        .setDescription('Nom de l\'équipe')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Supprime une équipe')
                .addStringOption(option =>
                    option.setName('nom')
                        .setDescription('Nom de l\'équipe')
                        .setRequired(true))),

    async execute(interaction, knex, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const teams = await knex('teams').select('*');
            if (teams.length === 0) {
                await interaction.reply({ content: 'Aucune équipe configurée', ephemeral: true });
            } else {
                const list = teams.map(t => `• **${t.label}** - <@&${t.role_id}>`).join('\n');
                await interaction.reply({ content: `**Équipes:**\n${list}`, ephemeral: true });
            }
        }

        if (subcommand === 'add') {
            const nom = interaction.options.getString('nom');

            if (nom.length > 12) {
                await interaction.reply({ content: `❌ Le nom de l'équipe ne peut pas dépasser 12 caractères (actuellement: ${nom.length})`, ephemeral: true });
                return;
            }

            try {
                await interaction.deferReply();

                // 1. Créer le rôle Discord
                const role = await interaction.guild.roles.create({
                    name: nom,
                    reason: `Création automatique pour l'équipe ${nom}`
                });

                // 2. Créer la catégorie privée
                const category = await interaction.guild.channels.create({
                    name: nom,
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone,
                            deny: [PermissionsBitField.Flags.ViewChannel],
                        },
                        {
                            id: role.id,
                            allow: [PermissionsBitField.Flags.ViewChannel],
                        }
                    ],
                });

                // 3. Créer le salon textuel "général"
                await interaction.guild.channels.create({
                    name: 'général',
                    type: ChannelType.GuildText,
                    parent: category.id,
                });

                // 4. Créer le salon vocal
                const voiceChannel = await interaction.guild.channels.create({
                    name: 'Créer un salon',
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                });

                // 5. Ajouter le salon vocal comme trigger channel
                await knex('trigger_channels').insert({ channel_id: voiceChannel.id });

                // 6. Enregistrer l'équipe en base de données
                await knex('teams').insert({
                    label: nom,
                    role_id: role.id,
                    category_id: category.id
                });

                // 7. Mettre à jour les messages d'inscription
                await updateInscriptionMessages(knex, client);

                // 8. Envoyer la commande Minecraft
                try {
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `teama create ${nom}`);
                } catch (mcError) {
                    console.error('Erreur commande Minecraft:', mcError);
                }

                await interaction.editReply({
                    content: `✅ Équipe **${nom}** créée avec succès!\n` +
                             `- Rôle: <@&${role.id}>\n` +
                             `- Catégorie: ${category.name}\n` +
                             `- Salon vocal ajouté comme trigger channel`
                });
            } catch (error) {
                console.error('Erreur création équipe:', error);
                const replyMethod = interaction.deferred ? 'editReply' : 'reply';
                await interaction[replyMethod]({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }

        if (subcommand === 'remove') {
            const nom = interaction.options.getString('nom');

            try {
                await interaction.deferReply();

                // 1. Récupérer les infos de l'équipe
                const team = await knex('teams').where('label', nom).first();

                if (!team) {
                    await interaction.editReply({ content: `Équipe **${nom}** non trouvée` });
                    return;
                }

                // 2. Désincrire tous les utilisateurs de l'équipe
                const teamUsers = await knex('users').where('team_id', team.id).select('*');
                const inscriptionMsgs = await knex('inscription_messages').select('inscrit_role_id');
                const inscritRoleIds = inscriptionMsgs.map(msg => msg.inscrit_role_id).filter(Boolean);

                for (const user of teamUsers) {
                    try {
                        // Retirer les rôles Discord
                        const member = await interaction.guild.members.fetch(user.discord_id);
                        if (member) {
                            const rolesToRemove = [];

                            // Rôle de l'équipe
                            const teamRole = interaction.guild.roles.cache.get(team.role_id);
                            if (teamRole && member.roles.cache.has(teamRole.id)) {
                                rolesToRemove.push(teamRole);
                            }

                            // Rôle(s) "inscrit"
                            inscritRoleIds.forEach(roleId => {
                                const inscritRole = interaction.guild.roles.cache.get(roleId);
                                if (inscritRole && member.roles.cache.has(inscritRole.id)) {
                                    rolesToRemove.push(inscritRole);
                                }
                            });

                            if (rolesToRemove.length > 0) {
                                await member.roles.remove(rolesToRemove);
                            }
                        }

                        // Désincrire sur Minecraft
                        await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme unregister ${user.minecraft_username}`);
                        await sendMinecraftCommand(process.env.PT_SERVER_ID, `tteamunregister ${user.minecraft_username}`);
                        await sendMinecraftCommand(process.env.PT_SERVER_ID, `kick ${minecraftUsername}`);
                    } catch (userError) {
                        console.error(`Erreur désinscription ${user.minecraft_username}:`, userError);
                    }
                }

                // Supprimer les utilisateurs de la BDD
                await knex('users').where('team_id', team.id).delete();

                // 3. Supprimer la catégorie et tous ses canaux (si elle existe)
                if (team.category_id) {
                    try {
                        const category = await interaction.guild.channels.fetch(team.category_id);
                        if (category) {
                            // Récupérer tous les canaux de la catégorie
                            const channelsInCategory = interaction.guild.channels.cache.filter(
                                ch => ch.parentId === category.id
                            );

                            // Supprimer les trigger channels de la BDD d'abord
                            for (const [, channel] of channelsInCategory) {
                                if (channel.type === ChannelType.GuildVoice) {
                                    await knex('trigger_channels').where('channel_id', channel.id).delete();
                                }
                            }

                            // Ensuite supprimer les canaux Discord
                            for (const [, channel] of channelsInCategory) {
                                await channel.delete();
                            }

                            // Supprimer la catégorie
                            await category.delete();
                        }
                    } catch (channelError) {
                        console.error('Erreur suppression catégorie:', channelError);
                    }
                }

                // 4. Supprimer le rôle Discord
                try {
                    const role = await interaction.guild.roles.fetch(team.role_id);
                    if (role) {
                        await role.delete();
                    }
                } catch (roleError) {
                    console.error('Erreur suppression rôle:', roleError);
                }

                // 5. Supprimer l'équipe de la base de données
                await knex('teams').where('label', nom).delete();

                // 6. Mettre à jour les messages d'inscription
                await updateInscriptionMessages(knex, client);

                // 7. Envoyer la commande Minecraft
                try {
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `teama disband ${nom}`);
                } catch (mcError) {
                    console.error('Erreur commande Minecraft:', mcError);
                }

                await interaction.editReply({
                    content: `✅ Équipe **${nom}** supprimée avec succès!\n` +
                             `- ${teamUsers.length} utilisateur(s) désinscrit(s)\n` +
                             `- Rôle supprimé\n` +
                             `- Catégorie et canaux supprimés\n` +
                             `- Trigger channels retirés de la BDD`
                });
            } catch (error) {
                console.error('Erreur suppression équipe:', error);
                const replyMethod = interaction.deferred ? 'editReply' : 'reply';
                await interaction[replyMethod]({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }
    }
};
