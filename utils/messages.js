async function sendLoginInstructions(user, password) {
    try {
        await user.send(`Connectez vous sur **mc.bde-imtbs-tsp.fr** en version **1.20.6**\nPuis tapez dans le chat \`/login ${password}\`\nVous en aurez besoin à chaque connexion\nVous serez automatiquement mis dans la bonne équipe\nSi vous rencontrez un problème veuillez contacter un modérateur`);
        return true;
    } catch (error) {
        console.error('Impossible d\'envoyer le DM:', error);
        return false;
    }
}

module.exports = { sendLoginInstructions };
