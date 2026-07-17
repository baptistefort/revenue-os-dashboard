# Déploiement VPS privé

Cette configuration déploie deux conteneurs séparés :

- `app` : l’interface Next.js OPS, visible uniquement par le Caddy existant ;
- `opencode` : le cerveau OpenCode `1.18.2`, sans port publié, joignable seulement sur le réseau Docker privé `ops_private`.

OpenCode conserve un accès Internet sortant pour appeler OpenAI, mais aucun port de son serveur n’est publié sur l’hôte ni relié à Caddy.

## 1. Réalité du serveur et règles de sécurité

`/srv/ops` est un répertoire de release envoyé sur le VPS, **pas un checkout Git**. Il ne faut donc jamais baser un retour arrière sur `git checkout` ou `git pull`.

Les éléments persistants sont séparés du code par convention :

- `/srv/ops/data/obsidian` : coffre Markdown ;
- `/srv/ops/data/documents` : PDF et métadonnées générés ;
- `/srv/ops/.env.production` : secrets, mode `600` ;
- `/srv/ops-deploy-state` : métadonnées versionnées des déploiements ;
- `/srv/ops-backups/<release>` : archive de données, configuration et tags d’images nécessaires au rollback.

Le script de déploiement ne publie jamais OpenCode, ne supprime jamais un coffre et refuse deux déploiements simultanés.

## 2. Préparer le VPS

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

## 3. Envoyer une nouvelle release sans toucher aux données

Préparer le code dans un dossier temporaire sur le VPS, puis synchroniser uniquement les sources. Le coffre, les documents et les secrets sont toujours exclus :

```bash
# Depuis la machine de développement
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"
rsync -az --delete \
  --exclude '.git/' \
  --exclude '.next/' \
  --exclude 'node_modules/' \
  --exclude 'data/' \
  --exclude '.env.production' \
  ./ root@VPS:/srv/ops-upload/"$RELEASE_ID"/

# Sur le VPS : aperçu obligatoire, puis synchronisation des seules sources
rsync -ani --delete \
  --exclude 'data/' \
  --exclude '.env.production' \
  /srv/ops-upload/"$RELEASE_ID"/ /srv/ops/
rsync -ai --delete \
  --exclude 'data/' \
  --exclude '.env.production' \
  /srv/ops-upload/"$RELEASE_ID"/ /srv/ops/
```

Conserver l’archive ou le dossier envoyé jusqu’à validation de la release publique. Le rollback d’exécution repose sur les anciennes images Docker ; ce dossier permet aussi de rétablir les sources lisibles du serveur si nécessaire.

## 4. Construire et démarrer

```bash
cd /srv/ops
chmod +x deploy/vps/deploy.sh
RELEASE_ID="$RELEASE_ID" APP_DIR=/srv/ops deploy/vps/deploy.sh
```

Avant toute mutation, le script :

1. verrouille le déploiement ;
2. valide Compose et le réseau Caddy ;
3. archive `data/`, `.env.production` et le fichier Compose ;
4. tague les images courantes avec `rollback-<release>` ;
5. écrit une fiche sans secret dans `/srv/ops-deploy-state/releases/<release>.env`.

Après construction, il normalise les droits, démarre les services, puis exige un succès de `/api/readiness`. Cette sonde profonde vérifie :

- OpenCode via `/global/health` et une authentification Basic interne ;
- lecture **et** écriture du coffre par l’identité effective de l’application ;
- lecture **et** écriture du stockage de documents, sans créer de fichier de test.

La liveness `/api/health` reste volontairement superficielle pour que Docker distingue un processus vivant d’une dépendance momentanément indisponible.

### Options de seed

Le premier lancement crée le coffre fictif si `data/obsidian` ne contient encore aucune note Markdown :

```bash
SEED_DEMO=auto APP_DIR=/srv/ops deploy/vps/deploy.sh
```

Pour ne jamais lancer le seed :

```bash
SEED_DEMO=never APP_DIR=/srv/ops deploy/vps/deploy.sh
```

`SEED_DEMO=always` met à jour la démo attendue sans supprimer les écritures opérationnelles préservées par le seed.

## 5. Empêcher le mélange de deux coffres

La démo attend par défaut le sous-dossier exact :

```text
data/obsidian/OPS Demo — Atelier Beaumarchais
```

Si des notes Markdown existent ailleurs (par exemple un ancien `data/obsidian/OPS`), le déploiement s’arrête **avant le build**. L’archive de pré-déploiement est déjà disponible, mais rien n’est déplacé ni supprimé automatiquement.

Pour remplacer explicitement un ancien coffre de démonstration :

```bash
cd /srv/ops
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p /srv/ops-vault-legacy
tar -czf /srv/ops-vault-legacy/obsidian-"$STAMP".tar.gz data/obsidian
mv data/obsidian /srv/ops-vault-legacy/obsidian-"$STAMP"
mkdir -p data/obsidian data/documents
RELEASE_ID="$STAMP" SEED_DEMO=always APP_DIR=/srv/ops deploy/vps/deploy.sh
```

`VAULT_MIGRATION_MODE=allow-existing` désactive ce garde-fou uniquement lorsqu’il est réellement intentionnel d’indexer plusieurs racines. Cette option ne migre rien. Pour un coffre client dont le nom est différent, définir explicitement `EXPECTED_VAULT_ROOT_NAME` ou le laisser vide après audit :

```bash
EXPECTED_VAULT_ROOT_NAME="Mon coffre validé" SEED_DEMO=never APP_DIR=/srv/ops deploy/vps/deploy.sh
```

## 6. Relier le Caddy déjà installé

Ajouter le contenu de `deploy/caddy/ops.caddy` au fichier réellement monté par le conteneur Caddy. Sur le VPS actuel, il s’agit de `/srv/sags-os/deploy/Caddyfile` — et non du fichier homonyme placé à la racine — puis recréer uniquement le service Caddy afin que le bind mount relise le bon fichier :

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

## 7. Vérifier

```bash
cd /srv/ops
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 app opencode
curl -fsS https://ops.72.61.111.77.sslip.io/api/health
curl -fsS https://ops.72.61.111.77.sslip.io/api/readiness
cat /srv/ops-deploy-state/last-successful-release
```

La réponse de readiness ne contient ni chemin interne, ni URL OpenCode, ni identifiant, ni secret. Le service OpenCode doit être `healthy`, sans être accessible depuis Internet. Le test suivant doit échouer depuis une machine externe :

```bash
curl --connect-timeout 3 http://72.61.111.77:4096/global/health
```

## 8. Retour arrière réel, sans Git

Chaque release possède :

- une archive `/srv/ops-backups/<release>/data.tar.gz` ;
- les fichiers `.env.production` et Compose antérieurs ;
- deux tags Docker `rollback-<release>` lorsqu’une version précédente existait ;
- une fiche `/srv/ops-deploy-state/releases/<release>.env`.

### Rollback applicatif en conservant les nouvelles données

Utiliser ce mode si le code est défectueux mais que les écritures Obsidian produites depuis le déploiement doivent rester :

```bash
RELEASE_ID="20260717T120000Z"
source /srv/ops-deploy-state/releases/"$RELEASE_ID".env
cd /srv/ops
cp -p "$backup_dir/$compose_file" "$compose_file"
[[ -n "$app_rollback_tag" ]] && docker image tag "$app_rollback_tag" ops-web:latest
[[ -n "$opencode_rollback_tag" ]] && docker image tag "$opencode_rollback_tag" ops-opencode:1.18.2
docker compose -f "$compose_file" up -d --no-build --remove-orphans
curl -fsS https://ops.72.61.111.77.sslip.io/api/health
# Une release antérieure à la sonde profonde peut répondre 404 ici.
curl -fsS https://ops.72.61.111.77.sslip.io/api/readiness || true
```

### Rollback complet des données

Ce mode remet le coffre et les documents dans l’état exact précédant la release. Il faut d’abord archiver l’état défaillant afin de ne perdre aucune écriture arrivée entre-temps :

```bash
RELEASE_ID="20260717T120000Z"
source /srv/ops-deploy-state/releases/"$RELEASE_ID".env
cd /srv/ops
docker compose -f "$compose_file" down

FAILED_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mv data /srv/ops-backups/data-after-failure-"$FAILED_STAMP"
tar -xzf "$backup_dir/data.tar.gz" -C /srv/ops
cp -p "$backup_dir/$compose_file" "$compose_file"

chown -R 1001:1002 data/obsidian
find data/obsidian -type d -exec chmod 2770 {} +
find data/obsidian -type f -exec chmod 660 {} +
chown -R 1001:1001 data/documents
find data/documents -type d -exec chmod 750 {} +
find data/documents -type f -exec chmod 640 {} +

[[ -n "$app_rollback_tag" ]] && docker image tag "$app_rollback_tag" ops-web:latest
[[ -n "$opencode_rollback_tag" ]] && docker image tag "$opencode_rollback_tag" ops-opencode:1.18.2
docker compose -f "$compose_file" up -d --no-build --remove-orphans
curl -fsS https://ops.72.61.111.77.sslip.io/api/health
# Une release antérieure à la sonde profonde peut répondre 404 ici.
curl -fsS https://ops.72.61.111.77.sslip.io/api/readiness || true
```

Ne restaurer l’ancien `.env.production` que si une modification de configuration est elle-même la cause de l’incident. Les archives contiennent des secrets et doivent rester en mode `600`, dans un répertoire `700`, avec une politique de rétention explicite.
