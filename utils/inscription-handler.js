const { generatePassword } = require('./password');
const { sendLoginInstructions } = require('./messages');
const { sendMinecraftCommand } = require('./pterodactyl');

async function handleInscription(interaction, knex, selectedTeamId, pseudo) {
    const discordId = interaction.user.id;

    const existingUser = await knex('users').where('discord_id', discordId).first();

    if (existingUser) {
        await interaction.reply({ content: `Vous êtes déjà inscrit. Veuillez contacter un modérateur si rencontrer un problème.`, ephemeral: true });
        return;
    }

    const existingPseudo = await knex('users').where('minecraft_username', pseudo).first();

    if (existingPseudo) {
        await interaction.reply({ content: `Ce pseudo est déjà pris`, ephemeral: true });
        return;
    }

    const team = await knex('teams').where('id', parseInt(selectedTeamId)).first();

    if (!team) {
        await interaction.reply({ content: `Erreur: Équipe invalide`, ephemeral: true });
        return;
    }

    try {
        const password = generatePassword();

        await knex('users')
            .insert({ discord_id: discordId, minecraft_username: pseudo, team_id: team.id, password: password })
            .onConflict('discord_id')
            .merge();

        // Enregistrer le joueur sur le serveur Minecraft
        try {
            await sendMinecraftCommand(process.env.PT_SERVER_ID, `authme register ${pseudo} ${password}`);
            await sendMinecraftCommand(process.env.PT_SERVER_ID, `tteamregister ${pseudo} ${team.label}`);
        } catch (error) {
            console.error('Erreur enregistrement Minecraft:', error.message);
        }

        const appState = await knex('app_state').first();
        const isRelease = appState && appState.release;

        if (isRelease) {
            await sendLoginInstructions(interaction.user, password);
        }

        const inscriptionMsg = await knex('inscription_messages')
            .where('channel_id', interaction.channel.id)
            .first();

        const rolesToAdd = [];

        const teamRole = interaction.guild.roles.cache.get(team.role_id);
        if (teamRole) rolesToAdd.push(teamRole);

        if (inscriptionMsg && inscriptionMsg.inscrit_role_id) {
            const inscritRole = interaction.guild.roles.cache.get(inscriptionMsg.inscrit_role_id);
            if (inscritRole) rolesToAdd.push(inscritRole);
        }

        if (rolesToAdd.length > 0) {
            await interaction.member.roles.add(rolesToAdd);
            const dmMessage = isRelease
                ? '\nVous avez reçu les instructions de connexion par DM.'
                : '\nVous recevrez les instructions de connexion par DM ultérieurement.';
            await interaction.reply({ content: `Inscrit dans **${team.label}** avec le pseudo **${pseudo}**${dmMessage}`, ephemeral: true });
        } else {
            await interaction.reply({ content: `Erreur: Rôle introuvable`, ephemeral: true });
        }
    } catch (err) {
        await interaction.reply({ content: `Erreur: ${err.message}`, ephemeral: true });
    }
}

module.exports = { handleInscription };
