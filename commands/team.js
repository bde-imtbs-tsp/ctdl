const { SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

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
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Rôle Discord')
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
            const role = interaction.options.getRole('role');

            try {
                await knex('teams').insert({ label: nom, role_id: role.id });
                await updateInscriptionMessages(knex, client);
                await interaction.reply({ content: `Équipe **${nom}** ajoutée`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }

        if (subcommand === 'remove') {
            const nom = interaction.options.getString('nom');

            try {
                const result = await knex('teams').where('label', nom).delete();
                if (result > 0) {
                    await updateInscriptionMessages(knex, client);
                    await interaction.reply({ content: `Équipe **${nom}** supprimée`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `Équipe **${nom}** non trouvée`, ephemeral: true });
                }
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }
    }
};
