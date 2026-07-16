# Déploiement VPS privé

Cette configuration déploie deux conteneurs séparés :

- `app` : l’interface Next.js OPS, visible uniquement par le Caddy existant ;
- `opencode` : le cerveau OpenCode `1.18.2`, sans port publié, joignable seulement sur le réseau Docker privé `ops_private`.

OpenCode conserve un accès Internet sortant pour appeler OpenAI, mais aucun port de son serveur n’est publié sur l’hôte ni relié à Caddy.

## 1. Préparer le VPS

Le projet est attendu dans `/srv/ops`. Les secrets restent dans `/srv/ops/.env.production` :

```bash
cd /srv/ops
cp .env.production.example .env.production
chmod 600 .env.production
```

Renseigner au minimum :

- `OPENAI_API_KEY` ;
- `FISH_AUDIO_API_KEY` pour la voix de sortie OPS ;
- `FISH_AUDIO_REFERENCE_ID` pour le modèle vocal Fish Audio choisi ;
- `OPENCODE_SERVER_PASSWORD` avec un secret long et aléatoire ;
- `OPENCODE_SESSION_SECRET` avec un autre secret d’au moins 64 octets.

Ne jamais exposer le port `4096` dans le pare-feu, dans `ports:` ou dans Caddy.

## 2. Construire et démarrer

```bash
chmod +x deploy/vps/deploy.sh
APP_DIR=/srv/ops deploy/vps/deploy.sh
```

Le premier lancement crée le coffre fictif si `data/obsidian` ne contient encore aucune note Markdown. Pour ne jamais lancer le seed :

```bash
SEED_DEMO=never APP_DIR=/srv/ops deploy/vps/deploy.sh
```

Les documents PDF restent dans `/srv/ops/data/documents`. Le coffre Obsidian reste dans `/srv/ops/data/obsidian`. Ces deux répertoires survivent aux reconstructions d’images.

## 3. Relier le Caddy déjà installé

Ajouter le contenu de `deploy/caddy/ops.caddy` au fichier réellement monté par
le conteneur Caddy. Sur le VPS actuel, il s’agit de
`/srv/sags-os/deploy/Caddyfile` — et non du fichier homonyme placé à la racine —
puis recréer uniquement le service Caddy afin que le bind mount relise le bon
fichier :

```bash
cd /srv/sags-os
docker run --rm \
  -v /srv/sags-os/deploy/Caddyfile:/etc/caddy/Caddyfile:ro \
  caddy:2.10.2-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate caddy
```

L’URL temporaire fournie utilise `sslip.io` et pointe automatiquement vers `72.61.111.77` :

```text
https://ops.72.61.111.77.sslip.io
```

Pour utiliser `ops.visionia-france.com`, créer d’abord un enregistrement DNS `A` vers `72.61.111.77`, puis remplacer uniquement le nom d’hôte dans le bloc Caddy.

## 4. Vérifier

```bash
cd /srv/ops
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 app opencode
curl -fsS https://ops.72.61.111.77.sslip.io/api/health
```

Le service OpenCode doit être `healthy`, sans être accessible depuis Internet. Le test suivant doit échouer depuis une machine externe :

```bash
curl --connect-timeout 3 http://72.61.111.77:4096/global/health
```

## 5. Mettre à jour et revenir en arrière

Avant une mise à jour :

```bash
cd /srv/ops
git rev-parse HEAD > .last-deployed-commit
git pull --ff-only
APP_DIR=/srv/ops deploy/vps/deploy.sh
```

Retour arrière :

```bash
cd /srv/ops
git checkout "$(cat .last-deployed-commit)"
APP_DIR=/srv/ops SEED_DEMO=never deploy/vps/deploy.sh
```

Les données persistantes ne sont pas supprimées par ces commandes.
