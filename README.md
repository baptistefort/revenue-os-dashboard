# OPS — Infrastructure IA du dirigeant

Application de démonstration réunissant le pilotage, l’agent IA, le cycle d’affaires, les emails, les documents, les clients, le planning, le CRM, les chiffres et la mémoire Obsidian d’une entreprise fictive.

## Démo

Toutes les entreprises, personnes et métriques visibles sont fictives. Aucune action externe n’est exécutée. Les scénarios prioritaires sont déterministes afin de produire des démonstrations et vidéos reproductibles.

## Fonctionnalités

- Tableau de bord dirigeant et alertes expliquées
- Agent conversationnel inspiré des interactions modernes de ChatGPT
- Réponses sourcées et cartes de mission soumises à validation
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

## Activer l’agent OpenAI

La clé doit rester exclusivement dans `.env.local` ou dans les secrets Vercel :

```bash
OPENAI_API_KEY=nouvelle_cle_non_exposee
OPENAI_MODEL=gpt-5.6
```

La route serveur `/api/agent` utilise la Responses API avec streaming. Les questions de démonstration connues restent disponibles sans clé.

## Vérifier la production

```bash
npm run lint
npm run build
```

## Architecture

- `components/ops-app.tsx` — shell et dix espaces métier
- `components/brain-graph.tsx` — graphe interactif et inspecteur
- `components/ops-icons.tsx` — bibliothèque d’icônes originale
- `lib/ops-demo-data.ts` — dataset et scénarios déterministes
- `app/api/vault/route.ts` — lecture sécurisée des métadonnées et relations Obsidian
- `app/api/agent/route.ts` — agent OpenAI côté serveur
- `scripts/seed-obsidian.mjs` — génération du coffre de démonstration

## Sécurité

- Ne jamais préfixer une clé OpenAI avec `NEXT_PUBLIC_`.
- Ne jamais committer `.env.local`.
- La route Obsidian n’expose que les métadonnées nécessaires au graphe, pas le contenu brut complet du coffre.
- Toute action vers un client reste simulée ou soumise à validation.
