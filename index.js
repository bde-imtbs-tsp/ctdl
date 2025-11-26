// Importe les classes nécessaires de la bibliothèque discord.js
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const knexConfig = require('./knexfile');

const knex = require('knex')(knexConfig.development);

// Importe la configuration (token et IDs des salons)
const { token, triggerChannelIds, teams } = require('./config.json');

// Crée une nouvelle instance du client (votre bot)
// Les "Intents" définissent les types d'événements que votre bot recevra
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates, // Nécessaire pour savoir qui rejoint/quitte les salons vocaux
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Un objet pour garder une trace des salons créés par le bot
const tempChannels = new Map();

// Cet événement se déclenche une seule fois, lorsque le bot est prêt et connecté
client.once('ready', async () => {
    try {
        console.log('Vérification des migrations de la base de données...');
        await knex.migrate.latest();
        console.log('Migrations appliquées avec succès.');
    } catch (error) {
        console.error('Erreur lors des migrations :', error);
    }

    console.log(`Connecté en tant que ${client.user.tag} !`);
    console.log(`Le bot est prêt à fonctionner.`);
});

// Cet événement se déclenche à chaque fois qu'un état vocal d'un membre change
// (rejoint/quitte un salon, se met en sourdine, etc.)
client.on('voiceStateUpdate', async (oldState, newState) => {
    // --- GESTION DE LA CRÉATION DE SALON ---

    // Vérifie si l'utilisateur a rejoint un des salons déclencheurs
    if (newState.channelId && triggerChannelIds.includes(newState.channelId)) {
        const member = newState.member; // Le membre qui a rejoint
        const guild = newState.guild;   // Le serveur
        const triggerChannel = newState.channel; // On récupère directement le salon déclencheur
        const category = triggerChannel.parent; // La catégorie du salon déclencheur

        // Crée un nouveau salon vocal pour l'utilisateur
        try {
            const newChannel = await guild.channels.create({
                name: `Salon de ${member.displayName}`, // Nom du nouveau salon
                type: ChannelType.GuildVoice, // C'est un salon vocal
                parent: category, // Place le salon dans la même catégorie
                permissionOverwrites: [
                    {
                        id: member.id, // Applique des permissions pour le créateur
                        allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.DeafenMembers],
                    },
                    {
                        id: guild.roles.everyone, // Permissions pour @everyone
                        deny: [PermissionsBitField.Flags.ViewChannel], // Optionnel: cache le salon par défaut
                    }
                ],
            });

            console.log(`Salon "${newChannel.name}" créé pour ${member.user.tag}.`);

            // Déplace l'utilisateur dans son nouveau salon
            await member.voice.setChannel(newChannel);

            // Ajoute le nouveau salon à notre liste de suivi
            tempChannels.set(newChannel.id, member.id);

        } catch (error) {
            console.error("Erreur lors de la création du salon :", error);
        }
    }

    // --- GESTION DE LA SUPPRESSION DE SALON ---

    // Vérifie si un salon temporaire est maintenant vide
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const channelToDelete = await oldState.guild.channels.fetch(oldState.channelId);
        
        // Si le salon est vide, on le supprime
        if (channelToDelete && channelToDelete.members.size === 0) {
            await channelToDelete.delete(`Salon temporaire vide.`);
            console.log(`Salon "${channelToDelete.name}" supprimé car il était vide.`);
            
            // Retire le salon de notre liste de suivi
            tempChannels.delete(oldState.channelId);
        }
    }
});

// Commande pour mettre en place le menu d'inscription
client.on('messageCreate', async message => {
    if (message.content === '!setup-inscription') {
        // Vérifie si l'utilisateur a les permissions (optionnel, ici tout le monde peut le faire pour tester)
        // if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_team')
                    .setPlaceholder('Choisissez votre équipe')
                    .addOptions(
                        teams.map(team => ({
                            label: team.label,
                            value: team.value,
                        }))
                    ),
            );

        await message.channel.send({
            content: 'Bienvenue ! Veuillez choisir votre équipe pour vous inscrire.',
            components: [row]
        });
    }
});

// Gestion des interactions (Menu de sélection et Modal)
client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_team') {
            const selectedTeamValue = interaction.values[0];
            
            // Crée le modal
            const modal = new ModalBuilder()
                .setCustomId(`modal_minecraft_pseudo_${selectedTeamValue}`)
                .setTitle('Inscription Minecraft');

            // Ajoute le champ de saisie du pseudo
            const pseudoInput = new TextInputBuilder()
                .setCustomId('pseudoInput')
                .setLabel("Quel est votre pseudo Minecraft ?")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(pseudoInput);

            modal.addComponents(firstActionRow);

            // Affiche le modal à l'utilisateur
            await interaction.showModal(modal);
        }
    } else if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId.startsWith('modal_minecraft_pseudo_')) {
            const selectedTeamValue = interaction.customId.split('modal_minecraft_pseudo_')[1];
            const pseudo = interaction.fields.getTextInputValue('pseudoInput');
            const discordId = interaction.user.id;

            // Trouve l'équipe correspondante dans la config
            const team = teams.find(t => t.value === selectedTeamValue);

            if (team) {
                // Enregistre dans la base de données avec Knex
                try {
                    await knex('users')
                        .insert({
                            discord_id: discordId,
                            minecraft_username: pseudo,
                            team_id: selectedTeamValue
                        })
                        .onConflict('discord_id')
                        .merge(); // Met à jour si l'ID existe déjà

                    // Ajoute le rôle à l'utilisateur
                    try {
                        const role = interaction.guild.roles.cache.get(team.roleId);
                        if (role) {
                            await interaction.member.roles.add(role);
                            await interaction.reply({ content: `Inscription réussie ! Vous avez rejoint **${team.label}** avec le pseudo Minecraft **${pseudo}**.`, ephemeral: true });
                        } else {
                            await interaction.reply({ content: `Inscription enregistrée, mais le rôle pour **${team.label}** est introuvable. Veuillez contacter un administrateur.`, ephemeral: true });
                        }
                    } catch (roleError) {
                        console.error("Erreur lors de l'ajout du rôle :", roleError);
                        await interaction.reply({ content: `Inscription enregistrée, mais je n'ai pas pu vous donner le rôle. Vérifiez mes permissions.`, ephemeral: true });
                    }

                } catch (err) {
                    console.error(err.message);
                    await interaction.reply({ content: 'Une erreur est survenue lors de l\'enregistrement.', ephemeral: true });
                }
            } else {
                await interaction.reply({ content: 'Équipe invalide.', ephemeral: true });
            }
        }
    }
});

// Connecte le bot à Discord avec son token
client.login(token);
