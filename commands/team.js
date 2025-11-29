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
                    name: 'Vocal',
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
                    await sendMinecraftCommand(process.env.PT_SERVER_ID, `teama add ${nom}`);
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
                const result = await knex('teams').where('label', nom).delete();
                if (result > 0) {
                    await updateInscriptionMessages(knex, client);
                    await interaction.reply({ content: `Équipe **${nom}** supprimée` });
                } else {
                    await interaction.reply({ content: `Équipe **${nom}** non trouvée` });
                }
            } catch (error) {
                await interaction.reply({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }
    }
};
