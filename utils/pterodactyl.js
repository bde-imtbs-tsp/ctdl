const PT_HOST = process.env.PT_HOST;
const PT_TOKEN = process.env.PT_TOKEN;

async function pterodactylRequest(endpoint, method = 'GET', body = null) {
    const apiPath = '/api/client';
    const url = `${PT_HOST}${apiPath}${endpoint}`;

    const token = PT_TOKEN;

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'Application/vnd.pterodactyl.v1+json',
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        throw new Error(`Pterodactyl API error: ${response.status} ${response.statusText}`);
    }

    // Si status 204 (No Content), ne pas tenter de parser le JSON
    if (response.status === 204) {
        return null;
    }

    return await response.json();
}

async function sendMinecraftCommand(serverId, command) {
    const state = await getServerState(serverId);

    if (state !== 'running') {
        throw new Error(`Le serveur n'est pas démarré (état actuel: ${state})`);
    }

    await pterodactylRequest(`/servers/${serverId}/command`, 'POST', { command });
}

async function getServerState(serverId) {
    const data = await pterodactylRequest(`/servers/${serverId}/resources`);
    return data.attributes.current_state;
}


async function getServers() {
    const data = await pterodactylRequest(``);
    return data.data;
}


module.exports = { sendMinecraftCommand, getServerState , getServers};
