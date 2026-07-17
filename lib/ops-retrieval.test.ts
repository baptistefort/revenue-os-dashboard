import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildOpsMemoryContext,
  invalidateOpsMemoryCache,
} from "./ops-retrieval";
import type { AgentHistoryTurn } from "./ops-memory";

type RetrievedRecord = {
  id: string;
  title: string;
  content: string;
  contentComplete?: boolean;
};

async function createVault(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ops-retrieval-"));
  const previousVault = process.env.OBSIDIAN_VAULT_PATH;
  process.env.OBSIDIAN_VAULT_PATH = root;
  invalidateOpsMemoryCache();

  t.after(async () => {
    if (previousVault === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = previousVault;
    invalidateOpsMemoryCache();
    await fs.rm(root, { recursive: true, force: true });
  });

  return root;
}

async function writeNote(
  root: string,
  directory: string,
  {
    id,
    type,
    title,
    updatedAt,
    attributes = "",
    body,
  }: {
    id: string;
    type: string;
    title: string;
    updatedAt: string;
    attributes?: string;
    body: string;
  },
) {
  const targetDirectory = path.join(root, directory);
  await fs.mkdir(targetDirectory, { recursive: true });
  await fs.writeFile(
    path.join(targetDirectory, `${id} — ${title}.md`),
    `---
id: ${id}
type: ${type}
title: "${title}"
updated_at: ${updatedAt}
${attributes}---

# ${title}

${body}
`,
    "utf8",
  );
}

function recordsFromContext(context: string | null): RetrievedRecord[] {
  assert.ok(context, "un contexte Obsidian devait être produit");
  const jsonStart = context.indexOf("{");
  assert.notEqual(jsonStart, -1, "le contexte devait contenir sa charge JSON");
  const parsed = JSON.parse(context.slice(jsonStart)) as {
    records: RetrievedRecord[];
  };
  return parsed.records;
}

function isoDate(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function compactDate(iso: string) {
  return iso.replaceAll("-", "");
}

test("un changement explicite de sujet remplace le contexte Rivoli/finance par le contexte SEO", async (t) => {
  const root = await createVault(t);

  await writeNote(root, "Finance", {
    id: "FIN-SNAPSHOT-20260716",
    type: "snapshot",
    title: "Situation finance et marge Rivoli",
    updatedAt: "2026-07-16T18:00:00+02:00",
    body: `
Le chantier Rivoli concentre la baisse de marge. La marge projetée recule
de 2,1 points et 14 heures n'ont pas été facturées.

- Écart confirmé : 2,1 points.
- Temps non facturé : 630 €.
`,
  });
  await writeNote(root, "Finance", {
    id: "ALERT-201",
    type: "alert",
    title: "Alerte Rivoli",
    updatedAt: "2026-07-16T18:05:00+02:00",
    body: `
Rivoli explique 82 % de l'écart financier observé sur la marge atelier.
`,
  });
  await writeNote(root, "SEO", {
    id: "SEO-SNAPSHOT-20260716",
    type: "snapshot",
    title: "Récap SEO du jour",
    updatedAt: "2026-07-16T18:10:00+02:00",
    attributes: `organic_clicks: 428
organic_impressions: 18640
average_position: 11.8
`,
    body: `
Le référencement organique progresse : 428 clics, 18 640 impressions et
une position moyenne de 11,8. La page « menuiserie hôtel Paris » gagne
trois positions dans Google Search Console.
`,
  });
  await writeNote(root, "SEO", {
    id: "SEO-TECH-20260716",
    type: "analysis",
    title: "Analyse SEO technique",
    updatedAt: "2026-07-16T18:12:00+02:00",
    attributes: `indexed_pages: 46
critical_errors: 0
`,
    body: `
L'analyse SEO technique confirme 46 pages indexées, aucune erreur critique
et deux redirections à corriger. Le prochain levier est le maillage interne.
`,
  });

  const history: AgentHistoryTurn[] = [
    { role: "user", content: "Pourquoi la marge atelier baisse ?" },
    {
      role: "assistant",
      content: "Rivoli explique 82 % de l'écart [ALERT-201] [FIN-SNAPSHOT-20260716].",
    },
    { role: "user", content: "Donne-moi seulement l'écart financier." },
    {
      role: "assistant",
      content: "La marge projetée baisse de 2,1 points sur Rivoli [ALERT-201].",
    },
  ];

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Moi, je te parlais plutôt de la partie SEO : donne-moi le récap complet.",
    history,
  ));
  const ids = records.map((record) => record.id);

  assert.deepEqual(ids.slice(0, 2).sort(), [
    "SEO-SNAPSHOT-20260716",
    "SEO-TECH-20260716",
  ].sort());
  assert.ok(ids.slice(0, 2).every((id) => id.startsWith("SEO-")), ids.join(", "));
  assert.ok(!ids.includes("ALERT-201"), ids.join(", "));
  assert.ok(!ids.includes("FIN-SNAPSHOT-20260716"), ids.join(", "));
  assert.match(JSON.stringify(records.slice(0, 2)), /428 clics/);
});

test("le format PDF ne remplace jamais le sujet SEO explicitement demandé", async (t) => {
  const root = await createVault(t);

  await writeNote(root, "SEO", {
    id: "SEO-SNAPSHOT-20260716",
    type: "snapshot",
    title: "SEO du 16 juillet",
    updatedAt: "2026-07-16T18:10:00+02:00",
    attributes: `period: 2026-07-16
clicks: 447
`,
    body: "Le SEO totalise 447 clics et la requête prioritaire atteint la position 7,1.",
  });
  await writeNote(root, "SEO", {
    id: "SEO-TECH-20260716",
    type: "analysis",
    title: "Audit SEO technique du 16 juillet",
    updatedAt: "2026-07-16T18:12:00+02:00",
    attributes: "period: 2026-07-16\n",
    body: "L’audit relève trois erreurs 404 et deux canoniques incohérentes.",
  });
  await writeNote(root, "Documents", {
    id: "RAPPORT-20260715-ANCIEN",
    type: "document",
    title: "Ancien rapport PDF financier",
    updatedAt: "2026-07-15T18:00:00+02:00",
    body: "Rapport financier sans rapport avec le référencement.",
  });

  const history: AgentHistoryTurn[] = [
    { role: "user", content: "Crée une opportunité Hôtel Marignan." },
    { role: "assistant", content: "L’opportunité a été créée dans le CRM." },
  ];
  const records = recordsFromContext(await buildOpsMemoryContext(
    "Génère-moi un PDF de synthèse SEO du 16 juillet 2026 avec audit technique.",
    history,
  ));
  const ids = records.map((record) => record.id);

  assert.ok(ids.includes("SEO-SNAPSHOT-20260716"), ids.join(", "));
  assert.ok(ids.includes("SEO-TECH-20260716"), ids.join(", "));
  assert.ok(!ids.includes("RAPPORT-20260715-ANCIEN"), ids.join(", "));
});

test("une demande sur les mails reçus hier remonte d'abord le digest et les messages entrants de la veille", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const yesterday = isoDate(-1);
  const todayCompact = compactDate(today);
  const yesterdayCompact = compactDate(yesterday);

  await writeNote(root, "Emails", {
    id: `MAIL-DIGEST-${yesterdayCompact}`,
    type: "email_digest",
    title: "Récapitulatif des mails reçus hier",
    updatedAt: `${yesterday}T19:00:00+02:00`,
    attributes: `period: ${yesterday}
direction: inbound
received_count: 7
`,
    body: `
Sept emails ont été reçus hier. Deux demandent une réponse aujourd'hui :
Nova Hôtels attend l'avenant et Atelier Sud confirme son règlement.

- Prioritaires : 2.
- Questions clients : 3.
- Informatifs : 2.
`,
  });
  await writeNote(root, "Emails", {
    id: `EMAIL-${yesterdayCompact}-NOVA`,
    type: "email",
    title: "Nova Hôtels demande l'avenant",
    updatedAt: `${yesterday}T16:12:00+02:00`,
    attributes: `received_at: ${yesterday}T16:12:00+02:00
direction: inbound
from: direction@novahotels.fr
`,
    body: `
Email reçu de Nova Hôtels : le client demande l'avenant Rivoli avant midi
et souhaite confirmer le nouveau calendrier.
`,
  });
  await writeNote(root, "Emails", {
    id: `EMAIL-${yesterdayCompact}-ATELIER`,
    type: "email",
    title: "Atelier Sud confirme le règlement",
    updatedAt: `${yesterday}T10:30:00+02:00`,
    attributes: `received_at: ${yesterday}T10:30:00+02:00
direction: inbound
from: compta@ateliersud.fr
`,
    body: `
Email reçu d'Atelier Sud : le virement de 12,4 K€ est annoncé pour vendredi.
`,
  });
  await writeNote(root, "Emails", {
    id: `MAIL-DIGEST-${todayCompact}`,
    type: "email_digest",
    title: "Récapitulatif des mails reçus aujourd'hui",
    updatedAt: `${today}T09:00:00+02:00`,
    attributes: `period: ${today}
direction: inbound
received_count: 1
`,
    body: `
Un email a été reçu aujourd'hui. Il ne demande aucune action immédiate.
`,
  });
  await writeNote(root, "Finance", {
    id: `FIN-SNAPSHOT-${todayCompact}`,
    type: "snapshot",
    title: "Situation financière du jour",
    updatedAt: `${today}T18:00:00+02:00`,
    body: `
La marge est à 29 % et le pipeline atteint 184 K€.
`,
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Est-ce que tu peux me faire un récap des mails reçus hier ?",
    [],
  ));
  const ids = records.map((record) => record.id);

  assert.equal(ids[0], `MAIL-DIGEST-${yesterdayCompact}`);
  assert.ok(ids.includes(`EMAIL-${yesterdayCompact}-NOVA`));
  assert.ok(ids.includes(`EMAIL-${yesterdayCompact}-ATELIER`));
  assert.ok(!ids.includes(`MAIL-DIGEST-${todayCompact}`), ids.join(", "));
  assert.doesNotMatch(JSON.stringify(records), /FIN-SNAPSHOT/);
  assert.match(records[0].content, /Sept emails ont été reçus hier/);
});

test("une journée complète d'emails est chargée avant les résultats textuels voisins", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const yesterday = isoDate(-1);
  const todayCompact = compactDate(today);
  const yesterdayCompact = compactDate(yesterday);

  await writeNote(root, "Emails", {
    id: `MAIL-DIGEST-${yesterdayCompact}`,
    type: "email_digest",
    title: "Digest complet des emails de la veille",
    updatedAt: `${yesterday}T19:00:00+02:00`,
    attributes: `period: ${yesterday}
direction: inbound
received_count: 11
`,
    body: "Onze emails entrants ont été reçus pendant cette journée.",
  });

  for (let index = 1; index <= 11; index += 1) {
    await writeNote(root, "Emails", {
      id: `EMAIL-${yesterdayCompact}-${String(index).padStart(2, "0")}`,
      type: "email",
      title: `Message entrant ${index}`,
      updatedAt: `${yesterday}T${String(7 + index).padStart(2, "0")}:00:00+02:00`,
      attributes: `received_at: ${yesterday}T${String(7 + index).padStart(2, "0")}:00:00+02:00
direction: inbound
from: contact-${index}@example.fr
`,
      body: `Contenu métier complet du message entrant numéro ${index}.`,
    });
  }

  await writeNote(root, "Emails", {
    id: `EMAIL-${todayCompact}-UNRELATED`,
    type: "email",
    title: "Message reçu aujourd'hui",
    updatedAt: `${today}T08:00:00+02:00`,
    attributes: `received_at: ${today}T08:00:00+02:00
direction: inbound
`,
    body: "Ce message du jour ne doit pas contaminer le récapitulatif de la veille.",
  });
  await writeNote(root, "Emails", {
    id: `EMAIL-${yesterdayCompact}-OUTBOUND`,
    type: "email",
    title: "Message envoyé hier",
    updatedAt: `${yesterday}T20:00:00+02:00`,
    attributes: `sent_at: ${yesterday}T20:00:00+02:00
direction: outbound
`,
    body: "Cet email sortant ne fait pas partie des messages reçus.",
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Quels emails avons-nous reçus hier ? Donne-moi le récapitulatif complet.",
    [],
  ));
  const ids = records.map((record) => record.id);

  assert.equal(ids[0], `MAIL-DIGEST-${yesterdayCompact}`);
  for (let index = 1; index <= 11; index += 1) {
    assert.ok(
      ids.includes(`EMAIL-${yesterdayCompact}-${String(index).padStart(2, "0")}`),
      `email ${index} absent : ${ids.join(", ")}`,
    );
  }
  assert.ok(!ids.includes(`EMAIL-${todayCompact}-UNRELATED`), ids.join(", "));
  assert.ok(!ids.includes(`EMAIL-${yesterdayCompact}-OUTBOUND`), ids.join(", "));
});

test("une relance datée hérite du dernier sujet explicite sans réintroduire les autres domaines", async (t) => {
  const root = await createVault(t);
  const yesterday = isoDate(-1);
  const yesterdayCompact = compactDate(yesterday);

  await writeNote(root, "SEO", {
    id: `SEO-SNAPSHOT-${yesterdayCompact}`,
    type: "snapshot",
    title: "SEO de la veille",
    updatedAt: `${yesterday}T18:00:00+02:00`,
    attributes: `period: ${yesterday}
clicks: 428
`,
    body: "Le SEO de la veille totalise 428 clics et une position moyenne de 13,8.",
  });
  await writeNote(root, "Finance", {
    id: `FIN-SNAPSHOT-${yesterdayCompact}`,
    type: "snapshot",
    title: "Finance de la veille",
    updatedAt: `${yesterday}T18:05:00+02:00`,
    attributes: `period: ${yesterday}
margin: 29
`,
    body: "La marge de la veille est à 29 %.",
  });
  await writeNote(root, "Emails", {
    id: `MAIL-DIGEST-${yesterdayCompact}`,
    type: "email_digest",
    title: "Emails de la veille",
    updatedAt: `${yesterday}T19:00:00+02:00`,
    attributes: `period: ${yesterday}
direction: inbound
`,
    body: "Trois emails sont arrivés pendant la veille.",
  });

  const history: AgentHistoryTurn[] = [
    { role: "user", content: "Donne-moi le récap SEO complet d'aujourd'hui." },
    {
      role: "assistant",
      content: "Le SEO progresse. Sources citées : SEO-SNAPSHOT-20260716.",
    },
  ];
  const records = recordsFromContext(await buildOpsMemoryContext(
    "Et hier, quel était l'écart ?",
    history,
  ));
  const ids = records.map((record) => record.id);

  assert.deepEqual(ids, [`SEO-SNAPSHOT-${yesterdayCompact}`]);
  assert.ok(!ids.some((id) => id.startsWith("FIN-")), ids.join(", "));
  assert.ok(!ids.some((id) => id.startsWith("MAIL-")), ids.join(", "));
});

test("une comparaison avec la veille conserve aussi la date du récap précédent", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const yesterday = isoDate(-1);
  const todayCompact = compactDate(today);
  const yesterdayCompact = compactDate(yesterday);

  await writeNote(root, "SEO", {
    id: `SEO-SNAPSHOT-${todayCompact}`,
    type: "snapshot",
    title: "SEO du jour",
    updatedAt: `${today}T18:00:00+02:00`,
    attributes: `period: ${today}
clicks: 447
`,
    body: "Le SEO du jour totalise 447 clics et une position moyenne de 13,4.",
  });
  await writeNote(root, "SEO", {
    id: `SEO-SNAPSHOT-${yesterdayCompact}`,
    type: "snapshot",
    title: "SEO de la veille",
    updatedAt: `${yesterday}T18:00:00+02:00`,
    attributes: `period: ${yesterday}
clicks: 428
`,
    body: "Le SEO de la veille totalise 428 clics et une position moyenne de 13,8.",
  });
  await writeNote(root, "Finance", {
    id: `FIN-SNAPSHOT-${todayCompact}`,
    type: "snapshot",
    title: "Finance du jour",
    updatedAt: `${today}T18:05:00+02:00`,
    attributes: `period: ${today}
`,
    body: "Cette note financière ne doit pas entrer dans la comparaison SEO.",
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Et par rapport à la veille, donne-moi uniquement les écarts importants.",
    [
      { role: "user", content: `Fais-moi le récap SEO complet du ${today}.` },
      { role: "assistant", content: `Le SEO progresse [SEO-SNAPSHOT-${todayCompact}].` },
    ],
  ));
  const ids = records.map((record) => record.id);

  assert.deepEqual(
    ids,
    [`SEO-SNAPSHOT-${todayCompact}`, `SEO-SNAPSHOT-${yesterdayCompact}`],
  );
  assert.ok(!ids.some((id) => id.startsWith("FIN-")), ids.join(", "));
});

test("avant-hier ne charge pas aussi les notes d'hier par sous-chaîne", async (t) => {
  const root = await createVault(t);
  const yesterday = isoDate(-1);
  const beforeYesterday = isoDate(-2);

  await writeNote(root, "SEO", {
    id: `SEO-SNAPSHOT-${compactDate(beforeYesterday)}`,
    type: "snapshot",
    title: "SEO avant-hier",
    updatedAt: `${beforeYesterday}T18:00:00+02:00`,
    attributes: `period: ${beforeYesterday}
clicks: 401
`,
    body: "Le SEO avant-hier totalise 401 clics.",
  });
  await writeNote(root, "SEO", {
    id: `SEO-SNAPSHOT-${compactDate(yesterday)}`,
    type: "snapshot",
    title: "SEO hier",
    updatedAt: `${yesterday}T18:00:00+02:00`,
    attributes: `period: ${yesterday}
clicks: 428
`,
    body: "Le SEO hier totalise 428 clics.",
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Donne-moi uniquement le SEO d'avant-hier.",
    [],
  ));
  const ids = records.map((record) => record.id);

  assert.deepEqual(ids, [`SEO-SNAPSHOT-${compactDate(beforeYesterday)}`]);
});

test("le premier domaine cité pilote une demande qui mentionne email et SEO", async (t) => {
  const root = await createVault(t);
  const yesterday = isoDate(-1);
  const compact = compactDate(yesterday);

  await writeNote(root, "Emails", {
    id: `EMAIL-${compact}-SEO`,
    type: "email",
    title: "Email reçu sur les correctifs SEO",
    updatedAt: `${yesterday}T17:00:00+02:00`,
    attributes: `received_at: ${yesterday}T17:00:00+02:00
direction: inbound
`,
    body: "L'agence confirme par email les correctifs SEO à livrer.",
  });
  await writeNote(root, "SEO", {
    id: `SEO-SNAPSHOT-${compact}`,
    type: "snapshot",
    title: "SEO de la veille",
    updatedAt: `${yesterday}T18:00:00+02:00`,
    attributes: `period: ${yesterday}
`,
    body: "Le snapshot SEO agrège les clics organiques.",
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Récapitule les emails reçus hier au sujet du SEO.",
    [],
  ));
  const ids = records.map((record) => record.id);

  assert.deepEqual(ids, [`EMAIL-${compact}-SEO`]);
});

test("une demande de PDF reprend les sources du sujet précédent dans une session neuve", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const todayCompact = compactDate(today);

  await writeNote(root, "SEO", {
    id: `SEO-SNAPSHOT-${todayCompact}`,
    type: "snapshot",
    title: "SEO du jour",
    updatedAt: `${today}T18:00:00+02:00`,
    attributes: `period: ${today}
clicks: 447
`,
    body: "Le SEO du jour totalise 447 clics et une position moyenne de 13,4.",
  });
  await writeNote(root, "SEO", {
    id: `SEO-TECH-${todayCompact}`,
    type: "analysis",
    title: "Audit SEO technique",
    updatedAt: `${today}T18:05:00+02:00`,
    attributes: `period: ${today}
errors_404: 3
`,
    body: "Trois erreurs 404 doivent être corrigées.",
  });
  await writeNote(root, "Documents", {
    id: "CONTRAT-001",
    type: "document",
    title: "Contrat sans rapport",
    updatedAt: `${today}T17:00:00+02:00`,
    body: "Ce contrat générique ne doit pas remplacer les preuves du fil.",
  });

  const history: AgentHistoryTurn[] = [
    { role: "user", content: "Analyse le SEO d'aujourd'hui." },
    {
      role: "assistant",
      content: `Le SEO progresse [SEO-SNAPSHOT-${todayCompact}] [SEO-TECH-${todayCompact}].`,
    },
  ];
  const records = recordsFromContext(await buildOpsMemoryContext(
    "Transforme cette analyse en PDF de décision.",
    history,
  ));
  const ids = records.map((record) => record.id);

  assert.ok(ids.includes(`SEO-SNAPSHOT-${todayCompact}`), ids.join(", "));
  assert.ok(ids.includes(`SEO-TECH-${todayCompact}`), ids.join(", "));
  assert.ok(!ids.includes("CONTRAT-001"), ids.join(", "));
});

test("le contexte préchargé reste un JSON valide sous forte densité documentaire", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const longParagraph = "Analyse organique détaillée avec métriques et recommandations. ".repeat(120);

  for (let index = 1; index <= 14; index += 1) {
    await writeNote(root, "SEO", {
      id: `SEO-LONG-${String(index).padStart(2, "0")}`,
      type: "analysis",
      title: `Analyse SEO volumineuse ${index}`,
      updatedAt: `${today}T${String(8 + Math.floor(index / 2)).padStart(2, "0")}:00:00+02:00`,
      attributes: `period: ${today}
metric: ${index * 10}
`,
      body: `${longParagraph}\n\n- Action SEO prioritaire numéro ${index}.`,
    });
  }

  const context = await buildOpsMemoryContext(
    "Analyse toutes les données SEO et prépare les priorités.",
    [],
  );
  const records = recordsFromContext(context);

  assert.ok(context);
  assert.ok(context.length <= 31_000, `contexte trop long : ${context.length}`);
  assert.ok(records.length >= 8, `seulement ${records.length} notes conservées`);
  assert.ok(records.every((record) => record.id.startsWith("SEO-LONG-")));
});

test("un bilan global daté charge les synthèses de chaque domaine du bon jour", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const yesterday = isoDate(-1);
  const todayCompact = compactDate(today);
  const yesterdayCompact = compactDate(yesterday);

  for (const note of [
    {
      directory: "Direction",
      id: `WIKI-DIRECTION-${todayCompact}`,
      type: "decision",
      title: "Synthèse de direction",
      body: "La synthèse rapproche finance, commercial et opérations.",
    },
    {
      directory: "Finance",
      id: `FIN-SNAPSHOT-${todayCompact}`,
      type: "snapshot",
      title: "Finance du jour",
      body: "La marge est à 28,9 %.",
    },
    {
      directory: "CRM",
      id: `CRM-SNAPSHOT-${todayCompact}`,
      type: "snapshot",
      title: "CRM du jour",
      body: "Le pipeline atteint 184 K€.",
    },
    {
      directory: "SEO",
      id: `SEO-SNAPSHOT-${todayCompact}`,
      type: "snapshot",
      title: "SEO du jour",
      body: "Le trafic organique atteint 447 clics.",
    },
  ]) {
    await writeNote(root, note.directory, {
      id: note.id,
      type: note.type,
      title: note.title,
      updatedAt: `${today}T18:00:00+02:00`,
      attributes: `period: ${today}
`,
      body: note.body,
    });
  }
  await writeNote(root, "Finance", {
    id: `FIN-SNAPSHOT-${yesterdayCompact}`,
    type: "snapshot",
    title: "Finance de la veille",
    updatedAt: `${yesterday}T18:00:00+02:00`,
    attributes: `period: ${yesterday}
`,
    body: "Cette note de la veille ne doit pas entrer dans le bilan du jour.",
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Fais-moi le bilan complet des analyses d'aujourd'hui.",
    [],
  ));
  const ids = records.map((record) => record.id);

  assert.ok(ids.includes(`WIKI-DIRECTION-${todayCompact}`), ids.join(", "));
  assert.ok(ids.includes(`FIN-SNAPSHOT-${todayCompact}`), ids.join(", "));
  assert.ok(ids.includes(`CRM-SNAPSHOT-${todayCompact}`), ids.join(", "));
  assert.ok(ids.includes(`SEO-SNAPSHOT-${todayCompact}`), ids.join(", "));
  assert.ok(!ids.includes(`FIN-SNAPSHOT-${yesterdayCompact}`), ids.join(", "));
});

test("un récap email n'aspire pas les fiches clients qui possèdent seulement une adresse email", async (t) => {
  const root = await createVault(t);
  const yesterday = isoDate(-1);
  const compact = compactDate(yesterday);

  await writeNote(root, "Emails", {
    id: `MAIL-DIGEST-${compact}`,
    type: "email_digest",
    title: "Digest entrant",
    updatedAt: `${yesterday}T19:00:00+02:00`,
    attributes: `period: ${yesterday}
direction: inbound
record_kind: email
`,
    body: "Deux messages entrants ont été reçus pendant la journée.",
  });
  await writeNote(root, "Emails", {
    id: `EMAIL-${compact}-CLIENT`,
    type: "email",
    title: "Demande du client",
    updatedAt: `${yesterday}T11:00:00+02:00`,
    attributes: `received_at: ${yesterday}T11:00:00+02:00
direction: inbound
record_kind: email
`,
    body: "Le client demande la dernière version du devis.",
  });
  await writeNote(root, "CRM", {
    id: "CLI-AVEC-EMAIL",
    type: "client",
    title: "Client avec adresse email",
    updatedAt: `${yesterday}T08:00:00+02:00`,
    attributes: `period: ${yesterday}
record_kind: client
email: direction@client.fr
`,
    body: "Fiche CRM du client, sans message reçu.",
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Récapitule tous les emails reçus hier.",
    [],
  ));
  const ids = records.map((record) => record.id);

  assert.deepEqual(ids, [`MAIL-DIGEST-${compact}`, `EMAIL-${compact}-CLIENT`]);
  assert.ok(!ids.includes("CLI-AVEC-EMAIL"), ids.join(", "));
});

test("la date de réception d'un email prime sur sa date technique de synchronisation", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const yesterday = isoDate(-1);

  await writeNote(root, "Emails", {
    id: "EMAIL-RECU-AUJOURDHUI",
    type: "email",
    title: "Message reçu aujourd'hui mais synchronisé hier",
    updatedAt: `${yesterday}T08:00:00+02:00`,
    attributes: `received_at: ${today}T09:00:00+02:00
direction: inbound
record_kind: email
`,
    body: "Ce message appartient à aujourd'hui selon received_at.",
  });
  await writeNote(root, "Emails", {
    id: "EMAIL-RECU-HIER",
    type: "email",
    title: "Message réellement reçu hier",
    updatedAt: `${today}T08:00:00+02:00`,
    attributes: `received_at: ${yesterday}T09:00:00+02:00
direction: inbound
record_kind: email
`,
    body: "Ce message appartient à hier selon received_at.",
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Quels emails avons-nous reçus hier ?",
    [],
  ));

  assert.deepEqual(records.map((record) => record.id), ["EMAIL-RECU-HIER"]);
});

test("une correction polie conserve le sujet métier au lieu de charger des analyses génériques", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const compact = compactDate(today);

  await writeNote(root, "SEO", {
    id: `SEO-SNAPSHOT-${compact}`,
    type: "snapshot",
    title: "SEO complet du jour",
    updatedAt: `${today}T18:00:00+02:00`,
    attributes: `period: ${today}
clicks: 447
`,
    body: "Le SEO du jour totalise 447 clics organiques et 16 980 impressions.",
  });
  await writeNote(root, "Finance", {
    id: `FIN-SNAPSHOT-${compact}`,
    type: "snapshot",
    title: "Finance du jour",
    updatedAt: `${today}T18:05:00+02:00`,
    attributes: `period: ${today}
`,
    body: "La marge est à 29 %.",
  });

  const history: AgentHistoryTurn[] = [
    { role: "user", content: "Analyse le SEO d'aujourd'hui." },
    { role: "assistant", content: `Premier point [SEO-SNAPSHOT-${compact}].` },
  ];
  const first = recordsFromContext(await buildOpsMemoryContext(
    "Peux-tu me donner le détail complet ?",
    history,
  ));
  const corrected = recordsFromContext(await buildOpsMemoryContext(
    "Je ne veux pas un récap limité à ce contexte, donne-moi tout.",
    history,
  ));

  assert.deepEqual(first.map((record) => record.id), [`SEO-SNAPSHOT-${compact}`]);
  assert.deepEqual(corrected.map((record) => record.id), [`SEO-SNAPSHOT-${compact}`]);
});

test("une comparaison SEO et Google Ads charge les deux domaines du même jour", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const compact = compactDate(today);

  await writeNote(root, "SEO", {
    id: `SEO-SNAPSHOT-${compact}`,
    type: "snapshot",
    title: "SEO du jour",
    updatedAt: `${today}T18:00:00+02:00`,
    attributes: `period: ${today}
clicks: 447
`,
    body: "Le référencement organique génère 14 leads qualifiés.",
  });
  await writeNote(root, "Marketing/Ads", {
    id: `GADS-DAILY-${compact}`,
    type: "marketing",
    title: "Google Ads du jour",
    updatedAt: `${today}T18:10:00+02:00`,
    attributes: `period: ${today}
platform: Google Ads
pipeline: 66000
`,
    body: "Google Ads génère 66 K€ de pipeline attribué.",
  });
  await writeNote(root, "Finance", {
    id: `FIN-SNAPSHOT-${compact}`,
    type: "snapshot",
    title: "Finance du jour",
    updatedAt: `${today}T18:15:00+02:00`,
    body: "Cette preuve n'appartient pas à la comparaison demandée.",
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Compare le SEO et Google Ads aujourd'hui.",
    [],
  ));
  const ids = records.map((record) => record.id);

  assert.ok(ids.includes(`SEO-SNAPSHOT-${compact}`), ids.join(", "));
  assert.ok(ids.includes(`GADS-DAILY-${compact}`), ids.join(", "));
  assert.ok(!ids.includes(`FIN-SNAPSHOT-${compact}`), ids.join(", "));
});

test("une question Google Ads exclut Meta et conserve ce canal dans la relance", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const compact = compactDate(today);

  await writeNote(root, "Marketing/Ads", {
    id: `GADS-DAILY-${compact}`,
    type: "marketing",
    title: "Google Ads du jour",
    updatedAt: `${today}T18:00:00+02:00`,
    attributes: `period: ${today}
platform: Google Ads
`,
    body: `Google Ads génère 66 K€ de pipeline avec cinq leads qualifiés.

## Relations

[[META-DAILY-${compact} — Meta Ads du jour]]`,
  });
  await writeNote(root, "Marketing/Ads", {
    id: `META-DAILY-${compact}`,
    type: "marketing",
    title: "Meta Ads du jour",
    updatedAt: `${today}T18:05:00+02:00`,
    attributes: `period: ${today}
platform: Meta Ads
`,
    body: "Meta Ads ne génère aucun lead qualifié.",
  });

  const initial = recordsFromContext(await buildOpsMemoryContext(
    "Analyse Google Ads aujourd'hui.",
    [],
  ));
  const followup = recordsFromContext(await buildOpsMemoryContext(
    "Peux-tu me donner le détail complet ?",
    [
      { role: "user", content: "Analyse Google Ads aujourd'hui." },
      { role: "assistant", content: `Google Ads progresse [GADS-DAILY-${compact}].` },
    ],
  ));

  assert.deepEqual(initial.map((record) => record.id), [`GADS-DAILY-${compact}`]);
  assert.deepEqual(followup.map((record) => record.id), [`GADS-DAILY-${compact}`]);
});

test("les preuves primaires conservent leur contenu complet avant les synthèses dérivées", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);
  const compact = compactDate(today);
  const completeBody = `${"Mesure SEO vérifiée et recommandation opérationnelle. ".repeat(55)}FIN-PREUVE-PRIMAIRE`;

  for (let index = 1; index <= 5; index += 1) {
    await writeNote(root, "SEO", {
      id: `SEO-PRIMARY-${index}`,
      type: index === 1 ? "snapshot" : "analysis",
      title: `Preuve SEO primaire ${index}`,
      updatedAt: `${today}T${String(10 + index).padStart(2, "0")}:00:00+02:00`,
      attributes: `period: ${today}
metric: ${index}
`,
      body: `${completeBody}-${index}`,
    });
  }
  for (let index = 1; index <= 10; index += 1) {
    await writeNote(root, "Wiki/Analyses", {
      id: `ANALYSIS-DERIVED-${index}`,
      type: "analysis",
      title: `Récap SEO dérivé ${index}`,
      updatedAt: `${today}T20:${String(index).padStart(2, "0")}:00+02:00`,
      attributes: `period: ${today}
record_kind: analysis
derived: true
app_created: true
`,
      body: "Cette synthèse dérivée ne doit pas évincer les preuves primaires.",
    });
  }

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Donne-moi l'analyse SEO complète d'aujourd'hui.",
    [],
  ));
  const ids = records.map((record) => record.id);

  assert.ok(ids.slice(0, 5).every((id) => id.startsWith("SEO-PRIMARY-")), ids.join(", "));
  assert.ok(!ids.some((id) => id.startsWith("ANALYSIS-DERIVED-")), ids.join(", "));
  assert.match(records[0].content, /FIN-PREUVE-PRIMAIRE/);
  assert.equal(records[0].contentComplete, true);
});

test("une note importée au titre générique reste retrouvable grâce à son contenu SEO", async (t) => {
  const root = await createVault(t);
  const today = isoDate(0);

  await writeNote(root, "Imports", {
    id: "IMPORT-MARKETING-001",
    type: "note",
    title: "Compte rendu mensuel",
    updatedAt: `${today}T17:00:00+02:00`,
    attributes: `period: ${today}
`,
    body: "Le référencement SEO atteint 502 clics organiques dans Search Console. Cette preuve provient du rapport importé.",
  });

  const records = recordsFromContext(await buildOpsMemoryContext(
    "Quels chiffres SEO avons-nous aujourd'hui ?",
    [],
  ));

  assert.deepEqual(records.map((record) => record.id), ["IMPORT-MARKETING-001"]);
  assert.match(records[0].content, /502 clics organiques/);
});
