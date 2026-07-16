# OPS — Infrastructure IA du dirigeant

Application de démonstration réunissant le pilotage, l’agent IA, le cycle d’affaires, les emails, les documents, les clients, le planning, le CRM, les chiffres et la mémoire Obsidian d’une entreprise fictive.

## Démo

Toutes les entreprises, personnes et métriques visibles sont fictives. Aucune
action externe n’est exécutée. Les réponses métier ne sont pas préparées dans le
front ni dans une liste de scénarios : OpenCode recherche les notes Markdown du
coffre Obsidian, rapproche les sources utiles et construit chaque réponse à
partir de la demande et du fil de conversation.

## Fonctionnalités

- Tableau de bord dirigeant et alertes expliquées
- Agent conversationnel inspiré des interactions modernes de ChatGPT
- Conversation vocale temps réel, transcription serveur et voix Fish Audio dédiée
- Réponses sourcées et cartes de mission soumises à validation
- Rapports PDF réellement générés, persistés, ouverts et téléchargés
- Cycle d’affaires de la demande au paiement
- Inbox email unifiée avec résumé et brouillon OPS
- Documents compris et reliés aux dossiers métier
- Portefeuille clients et fiches 360
- Planning, risques de capacité et continuité du savoir
- CRM, prévisions et arbitrage d’opportunités
- Finance, SEO, Google Ads, Meta Ads et Instagram
- Onglet Cerveau alimenté par les vraies notes et wikiliens du coffre Obsidian local
- Icônes SVG originales et interface responsive

## Lancer le projet

```bash
npm install
cp .env.example .env.local
npm run opencode:serve
```

Dans un second terminal :

```bash
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000).

## Relier Obsidian

Dans `.env.local` :

```bash
OBSIDIAN_VAULT_PATH=/chemin/absolu/vers/le/coffre
```

Créer les données fictives dans un sous-dossier isolé du coffre :

```bash
OBSIDIAN_VAULT_PATH="/chemin/vers/le/coffre" node scripts/seed-obsidian.mjs
```

Le script ne supprime aucune note existante. Il crée uniquement `OPS Demo — Atelier Beaumarchais/`.

## Activer le cerveau OpenCode

La clé doit rester exclusivement dans `.env.local` ou dans les secrets Vercel :

```bash
OPENAI_API_KEY=nouvelle_cle_non_exposee
OPENAI_MODEL=gpt-5.4-mini
OPENCODE_BASE_URL=http://127.0.0.1:4096
OPENCODE_DIRECTORY=/chemin/absolu/vers/dashboard
```

OpenCode tourne comme un service privé et n’apparaît jamais dans l’interface OPS. Il conserve la session, choisit les outils de lecture autorisés, interroge la mémoire métier et le coffre Obsidian, puis renvoie une réponse structurée à `/api/agent`.

## Configurer la voix Fish Audio

La voix de sortie OPS utilise Fish Audio. La conversation temps réel OpenAI sert
uniquement à capter et transcrire la parole ; la réponse métier reste produite
par OpenCode, puis lue par Fish Audio :

```bash
FISH_AUDIO_API_KEY=cle_serveur
FISH_AUDIO_REFERENCE_ID=e11e47c85dc7449a9ce30c0993f87f91
FISH_AUDIO_MODEL=s2.1-pro
FISH_AUDIO_LATENCY=low
```

La clé Fish Audio ne doit jamais être préfixée par `NEXT_PUBLIC_`, placée dans le
frontend ou commitée. Si Fish Audio est momentanément indisponible, OPS peut
utiliser le TTS OpenAI serveur, puis la voix locale du navigateur en dernier
recours.

En production, placer OpenCode sur un service privé persistant, protéger l’accès
avec `OPENCODE_SERVER_PASSWORD` et utiliser un réseau interne. Si OpenCode est
indisponible, OPS affiche une erreur technique réessayable ; aucun second moteur
local ne fabrique de réponse métier.

`OPENCODE_SESSION_SECRET` doit contenir une valeur longue et aléatoire en production. Le navigateur ne reçoit jamais l’identifiant OpenCode brut : OPS le conserve dans un cookie signé, `HttpOnly` et `SameSite=Lax`.

## Vérifier la production

```bash
npm test
npm run lint
npm run build
```

Le déploiement Docker/VPS complet est documenté dans
[`deploy/README.md`](deploy/README.md).

## Architecture

- `components/ops-app.tsx` — shell et dix espaces métier
- `components/brain-graph.tsx` — graphe interactif et inspecteur
- `components/ops-icons.tsx` — bibliothèque d’icônes originale
- `lib/ops-demo-data.ts` — dataset d’interface fictif
- `lib/obsidian-vault-memory.ts` — indexation des vraies notes Markdown et wikiliens
- `app/api/vault/route.ts` — lecture sécurisée des métadonnées et relations Obsidian
- `lib/opencode-adapter.ts` — client privé, sessions et réponses structurées OpenCode
- `.opencode/agents/ops.md` — comportement du cerveau OPS
- `.opencode/tools/ops.ts` — outils de lecture mémoire et Obsidian
- `app/api/agent/route.ts` — passerelle NDJSON entre l’interface et OpenCode
- `app/api/documents/generate/route.ts` — moteur de rendu PDF déterministe
- `app/api/audio/*` — transcription et synthèse vocale
- `scripts/seed-obsidian.mjs` — génération du coffre de démonstration

## Sécurité

- Ne jamais préfixer une clé OpenAI avec `NEXT_PUBLIC_`.
- Ne jamais préfixer la clé Fish Audio avec `NEXT_PUBLIC_`.
- Ne jamais committer `.env.local`.
- Ne jamais exposer directement le port OpenCode au navigateur.
- Les outils OpenCode sont en lecture seule ; les outils système, shell et écriture sont refusés.
- La route Obsidian n’expose que les métadonnées nécessaires au graphe, pas le contenu brut complet du coffre.
- Toute action vers un client reste simulée ou soumise à validation.
