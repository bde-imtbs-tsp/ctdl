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
                        .setRequired(true))),

    async execute(interaction, knex) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            try {
                const users = await knex('users')
                    .leftJoin('teams', 'users.team_id', 'teams.id')
                    .select('users.discord_id', 'users.minecraft_username', 'users.password', 'teams.label as team_label');

                if (users.length === 0) {
                    await interaction.reply({ content: 'Aucun utilisateur inscrit', ephemeral: true });
                } else {
                    const list = users.map(u =>
                        `• <@${u.discord_id}> - **${u.minecraft_username}** - Équipe: **${u.team_label || 'Aucune'}** - MDP: \`${u.password || 'N/A'}\``
                    ).join('\n');
                    await interaction.reply({ content: `**Utilisateurs inscrits:**\n${list}`, ephemeral: true });
                }
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
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme unregister ${minecraftUsername}`);
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `tteamunregister ${minecraftUsername}`);
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

                await interaction.reply({ content: `Utilisateur <@${user.id}> (**${minecraftUsername}**) désenregistré`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }
    }
};
