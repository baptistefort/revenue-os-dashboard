# Revenue OS — Infrastructure IA de prospection

Prototype interactif d’un cockpit de prospection B2B agentique, conçu dans le langage visuel minimal de SOMA.

## Ce que montre le prototype

- Cockpit IA et missions persistantes
- Lead Finder multi-source : Serper Maps, data.gouv et Apollo simulés
- CRM conversationnel avec réponses sourcées
- Préparation et supervision de campagnes email
- Inbox unifiée avec qualification IA
- LinkedIn Studio en mode assisté
- Agent IA contextuel accessible depuis tous les écrans

## Important

Cette version est une démonstration visuelle. Elle ne se connecte à aucune API, ne consomme aucun crédit et n’envoie aucun email, message LinkedIn ou autre action externe. Toutes les entreprises, personnes, métriques et réponses visibles sont fictives.

## Lancer localement

```bash
npm install
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000).

## Vérifier la production

```bash
npm run lint
npm run build
```

## Stack

- Next.js 16
- React 19
- TypeScript
- Lucide React
- CSS sur mesure et police Anthropic Sans locale
