const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { sendLoginInstructions } = require('../utils/messages');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('release')
        .setDescription('Gère le mode release')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addBooleanOption(option =>
            option.setName('active')
                .setDescription('Activer (true) ou désactiver (false) le mode release')
                .setRequired(false)),

    async execute(interaction, knex, client) {
        try {
            const activeOption = interaction.options.getBoolean('active');

            if (activeOption === null) {
                const appState = await knex('app_state').first();
                const status = appState && appState.release ? 'activé' : 'désactivé';
                await interaction.reply({ content: `Mode release actuellement **${status}**` });
            } else if (activeOption === true) {
                await interaction.deferReply();

                const users = await knex('users').select('discord_id', 'password');

                let successCount = 0;
                const failedUsers = [];

                for (const user of users) {
                    try {
                        const discordUser = await client.users.fetch(user.discord_id);
                        const success = await sendLoginInstructions(discordUser, user.password);
                        if (success) {
                            successCount++;
                        } else {
                            failedUsers.push(user.discord_id);
                        }
                    } catch (error) {
                        console.error(`Impossible de récupérer l'utilisateur ${user.discord_id}:`, error);
                        failedUsers.push(user.discord_id);
                    }
                }

                await knex('app_state').update({ release: true });

                let message = `Mode release activé.\nMots de passe envoyés: ${successCount} réussis, ${failedUsers.length} échoués`;
                if (failedUsers.length > 0) {
                    const failedMentions = failedUsers.map(id => `<@${id}>`).join(', ');
                    message += `\n\n**Échecs:** ${failedMentions}`;
                }

                await interaction.editReply({ content: message });
            } else {
                await knex('app_state').update({ release: false });
                await interaction.reply({ content: 'Mode release désactivé' });
            }
        } catch (error) {
            await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true }).catch(() => {
                interaction.editReply({ content: `Erreur: ${error.message}` });
            });
        }
    }
};
