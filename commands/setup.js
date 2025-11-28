const { SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

async function createInscriptionMessage(channel, knex) {
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Envoie le formulaire d\'inscription')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Salon où envoyer le formulaire')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role_inscrit')
                .setDescription('Rôle "Inscrit" à donner')
                .setRequired(true)),

    async execute(interaction, knex) {
        const channel = interaction.options.getChannel('channel');
        const roleInscrit = interaction.options.getRole('role_inscrit');

        try {
            const teams = await knex('teams').select('*');
            if (teams.length === 0) {
                await interaction.reply({ content: 'Aucune équipe configurée', ephemeral: true });
                return;
            }

            const message = await createInscriptionMessage(channel, knex);
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
};
