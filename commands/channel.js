const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channel')
        .setDescription('Gère les salons de déclenchement')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Liste les salons de déclenchement'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ajoute un salon de déclenchement')
                .addChannelOption(option =>
                    option.setName('salon')
                        .setDescription('Salon vocal')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Supprime un salon de déclenchement')
                .addChannelOption(option =>
                    option.setName('salon')
                        .setDescription('Salon à supprimer')
                        .setRequired(true))),

    async execute(interaction, knex) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const channels = await knex('trigger_channels').select('*');
            if (channels.length === 0) {
                await interaction.reply({ content: 'Aucun salon configuré', ephemeral: true });
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
                await interaction.reply({ content: `**Salons de déclenchement:**\n${list.join('\n')}`, ephemeral: true });
            }
        }

        if (subcommand === 'add') {
            const channel = interaction.options.getChannel('salon');

            try {
                await knex('trigger_channels').insert({ channel_id: channel.id });
                await interaction.reply({ content: `Salon <#${channel.id}> ajouté` });
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }

        if (subcommand === 'remove') {
            const channel = interaction.options.getChannel('salon');

            try {
                const result = await knex('trigger_channels').where('channel_id', channel.id).delete();
                if (result > 0) {
                    await interaction.reply({ content: `Salon <#${channel.id}> supprimé` });
                } else {
                    await interaction.reply({ content: `Salon <#${channel.id}> non configuré` });
                }
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }
    }
};
