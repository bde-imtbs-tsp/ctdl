# Bot Discord CTDL

Ce bot gère des salons vocaux temporaires et un système d'inscription avec choix d'équipe et enregistrement de pseudo Minecraft.

## Prérequis

- Node.js installé
- Une base de données SQLite (gérée automatiquement)

## Installation

1.  Installez les dépendances :
    ```bash
    npm install
    ```

## Configuration (`config.json`)

Le fichier `config.json` doit contenir les informations suivantes :

```json
{
  "token": "VOTRE_TOKEN_DISCORD",
  "triggerChannelIds": ["ID_SALON_VOCAL_1", "ID_SALON_VOCAL_2"],
  "teams": [
    { "label": "Équipe 1", "value": "team_1", "roleId": "ID_ROLE_EQUIPE_1" },
    { "label": "Équipe 2", "value": "team_2", "roleId": "ID_ROLE_EQUIPE_2" },
    ...
  ]
}
```

*   **token** : Le token de votre bot Discord.
*   **triggerChannelIds** : Une liste d'IDs de salons vocaux. Quand un utilisateur rejoint l'un de ces salons, un salon temporaire est créé pour lui.
*   **teams** : La configuration des équipes pour le système d'inscription.
    *   `label` : Le nom affiché dans le menu déroulant.
    *   `value` : L'identifiant interne de l'équipe (ne pas changer sauf si nécessaire).
    *   `roleId` : **IMPORTANT** : Remplacez `REMPLACER_PAR_ID_ROLE_X` par l'ID réel du rôle Discord correspondant à cette équipe.

## Base de Données et Migrations

Ce projet utilise **Knex.js** pour gérer la base de données SQLite et ses évolutions (migrations).

### Fonctionnement automatique

À chaque démarrage du bot (`npm run dev` ou `node index.js`), le système vérifie automatiquement si de nouvelles migrations doivent être appliquées et les exécute. Vous n'avez généralement rien à faire manuellement.

### Créer une nouvelle migration

Si vous devez modifier la structure de la base de données (par exemple, ajouter une colonne), créez une nouvelle migration :

```bash
npx knex migrate:make nom_de_la_modification
```
*Exemple : `npx knex migrate:make add_points_column`*

Cela va créer un fichier dans le dossier `migrations/`. Ouvrez-le et définissez les changements :

*   `up` : Ce qui doit être fait (ex: `table.integer('points')`).
*   `down` : Ce qui doit être fait pour annuler (ex: `table.dropColumn('points')`).

### Commandes utiles

*   **Appliquer les migrations manuellement** :
    ```bash
    npx knex migrate:latest
    ```

*   **Annuler la dernière migration** (en cas d'erreur) :
    ```bash
    npx knex migrate:rollback
    ```

## Lancement

Pour lancer le bot :

```bash
npm run dev
```
ou
```bash
node index.js
```
