const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { sendMinecraftCommand } = require('../utils/pterodactyl');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Gère les utilisateurs inscrits')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Liste les utilisateurs inscrits'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unregister')
                .setDescription('Désenregistre un utilisateur')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('Utilisateur à désenregistrer')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Affiche les statistiques d\'inscription')),

    async execute(interaction, knex) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            try {
                const users = await knex('users')
                    .leftJoin('teams', 'users.team_id', 'teams.id')
                    .select('users.discord_id', 'users.minecraft_username', 'users.password', 'teams.label as team_label')
                    .orderBy('teams.label');

                if (users.length === 0) {
                    await interaction.reply({ content: 'Aucun utilisateur inscrit', ephemeral: true });
                } else {
                    const usersByTeam = {};
                    users.forEach(u => {
                        const team = u.team_label || 'Sans équipe';
                        if (!usersByTeam[team]) {
                            usersByTeam[team] = [];
                        }
                        usersByTeam[team].push(u);
                    });

                    const sections = Object.keys(usersByTeam).map(team => {
                        const teamUsers = usersByTeam[team].map(u =>
                            `- <@${u.discord_id}> - **${u.minecraft_username}** - MDP: \`${u.password || 'N/A'}\``
                        ).join('\n');
                        return `**${team}**\n${teamUsers}`;
                    });

                    await interaction.reply({ content: `**Utilisateurs inscrits:**\n\n${sections.join('\n\n')}`, ephemeral: true });
                }
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }

        if (subcommand === 'stats') {
            try {
                const users = await knex('users')
                    .leftJoin('teams', 'users.team_id', 'teams.id')
                    .select('users.discord_id', 'teams.label as team_label');

                const inscriptionMsgs = await knex('inscription_messages').select('inscrit_role_id');
                const inscritRoleIds = inscriptionMsgs.map(msg => msg.inscrit_role_id).filter(Boolean);

                const statsByTeam = {};
                users.forEach(u => {
                    const team = u.team_label || 'Sans équipe';
                    statsByTeam[team] = (statsByTeam[team] || 0) + 1;
                });

                const allMembers = await interaction.guild.members.fetch();
                const nonInscrits = allMembers.filter(member => {
                    const hasInscritRole = inscritRoleIds.some(roleId => member.roles.cache.has(roleId));
                    return !hasInscritRole && !member.user.bot;
                }).size;

                const sections = Object.keys(statsByTeam).sort().map(team => {
                    return `**${team}** : ${statsByTeam[team]}`;
                });

                sections.push(`**Non inscrits** : ${nonInscrits}`);

                await interaction.reply({ content: `**Statistiques d'inscription:**\n\n${sections.join('\n')}` });
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }

        if (subcommand === 'unregister') {
            const user = interaction.options.getUser('utilisateur');

            try {
                const userData = await knex('users').where('discord_id', user.id).first();

                if (!userData) {
                    await interaction.reply({ content: `Utilisateur <@${user.id}> non trouvé`, ephemeral: true });
                    return;
                }

                const minecraftUsername = userData.minecraft_username;

                // Supprimer de la BDD
                await knex('users').where('discord_id', user.id).delete();

                // Désenregistrer et kick sur Minecraft
                try {
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme unregister ${minecraftUsername}`);
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `tteamunregister ${minecraftUsername}`);
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `kick ${minecraftUsername}`);
                } catch (error) {
                    console.error('Erreur commandes Minecraft:', error.message);
                }

                // Retirer les rôles Discord
                const member = await interaction.guild.members.fetch(user.id);
                const teams = await knex('teams').select('role_id');
                const inscriptionMsgs = await knex('inscription_messages').select('inscrit_role_id');

                const rolesToRemove = [];
                teams.forEach(t => {
                    const role = interaction.guild.roles.cache.get(t.role_id);
                    if (role && member.roles.cache.has(role.id)) {
                        rolesToRemove.push(role);
                    }
                });

                inscriptionMsgs.forEach(msg => {
                    if (msg.inscrit_role_id) {
                        const role = interaction.guild.roles.cache.get(msg.inscrit_role_id);
                        if (role && member.roles.cache.has(role.id)) {
                            rolesToRemove.push(role);
                        }
                    }
                });

                if (rolesToRemove.length > 0) {
                    await member.roles.remove(rolesToRemove);
                }

                await interaction.reply({ content: `Utilisateur <@${user.id}> (**${minecraftUsername}**) désenregistré` });
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }
    }
};
