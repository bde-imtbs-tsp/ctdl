require('dotenv').config({ quiet: true });

const { Client, GatewayIntentBits, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, REST, Routes } = require('discord.js');
const knexConfig = require('./knexfile');
const fs = require('fs');
const path = require('path');

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
const commands = new Map();
const commandsData = [];

// Charger toutes les commandes
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.set(command.data.name, command);
    commandsData.push(command.data.toJSON());
}

const { handleInscription } = require('./utils/inscription-handler');
const { sendMinecraftCommand} = require('./utils/pterodactyl');

client.once('clientReady', async () => {
    try {
        await knex.migrate.latest();

        const appState = await knex('app_state').first();
        if (!appState) {
            await knex('app_state').insert({ release: false });
        }

        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
        console.log(`Connecté: ${client.user.tag}`);

        await sendMinecraftCommand(process.env.PT_SERVER_ID, 'say Bot connecté');
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

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (command) {
            try {
                await command.execute(interaction, knex, client);
            } catch (error) {
                console.error('Erreur commande:', error);
                await interaction.reply({ content: 'Erreur lors de l\'exécution de la commande', ephemeral: true }).catch(console.error);
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_team') {
            const selectedTeamId = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`modal_minecraft_pseudo_${selectedTeamId}`)
                .setTitle('Inscription Minecraft');

            const { ActionRowBuilder } = require('discord.js');
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
            await handleInscription(interaction, knex, selectedTeamId, pseudo);
        }
    }
});

client.login(token);
