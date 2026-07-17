import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateUniverseAggregates,
  centralMemoryImportOrder,
  expectedUniverseAggregates,
  generateAtelierBeaumarchaisUniverse,
  serializeUniverseAsNdjson,
} from "@/lib/atelier-beaumarchais-universe";
import type { CompanyMemoryUniverse, MemoryRecord } from "@/lib/company-memory-schema";

function records(universe: CompanyMemoryUniverse): Array<MemoryRecord & { kind: string }> {
  return [
    ...universe.clients,
    ...universe.contacts,
    ...universe.opportunities,
    ...universe.projects,
    ...universe.invoices,
    ...universe.payments,
    ...universe.emailThreads,
    ...universe.emailMessages,
    ...universe.meetings,
    ...universe.metrics,
    ...universe.decisions,
    ...universe.tasks,
    ...universe.documents,
    ...universe.commitments,
    ...universe.relations,
    ...universe.sourceEvents,
  ];
}

test("l'univers couvre douze mois et tous les volumes métier", () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  const aggregates = calculateUniverseAggregates(universe);

  assert.equal(aggregates.counts.clients, 30);
  assert.equal(aggregates.counts.contacts, 60);
  assert.equal(aggregates.counts.opportunities, 25);
  assert.equal(aggregates.counts.projects, 12);
  assert.equal(aggregates.counts.invoices, 180);
  assert.equal(aggregates.counts.payments, 177);
  assert.equal(aggregates.counts.emailThreads, 180);
  assert.equal(aggregates.counts.emailMessages, 1_260);
  assert.equal(aggregates.counts.meetings, 60);
  assert.equal(aggregates.counts.decisions, 120);
  assert.equal(aggregates.counts.tasks, 240);
  assert.ok(aggregates.counts.documents >= 180);
  assert.equal(aggregates.counts.commitments, 120);
  assert.ok(aggregates.counts.relations > 2_000);
  assert.ok(aggregates.counts.sourceEvents > 2_900);

  const financeMonths = new Set(universe.metrics.filter((item) => item.domain === "finance").map((item) => item.periodStart.slice(0, 7)));
  const seoMonths = new Set(universe.metrics.filter((item) => item.domain === "seo" && item.periodStart.endsWith("-01")).map((item) => item.periodStart.slice(0, 7)));
  assert.equal(financeMonths.size, 12);
  assert.equal(seoMonths.size, 12);
  for (const domain of ["google-ads", "meta-ads", "instagram", "linkedin"] as const) {
    assert.equal(new Set(universe.metrics.filter((item) => item.domain === domain).map((item) => item.periodStart.slice(0, 7))).size, 12, domain);
  }
  for (const domain of ["crm", "operations", "web", "customer", "hr", "procurement"] as const) {
    assert.equal(new Set(universe.metrics.filter((item) => item.domain === domain).map((item) => item.periodStart.slice(0, 7))).size, 12, domain);
  }

  const notionDocuments = universe.documents.filter((item) => item.trace.source === "notion");
  const slackDocuments = universe.documents.filter((item) => item.trace.source === "slack");
  assert.ok(notionDocuments.length >= 40, "plans de compte et notes stratégiques Notion");
  assert.ok(slackDocuments.length >= 60, "synthèses Slack client et direction");
  assert.ok(universe.documents.some((item) => item.id === "NTN-STRAT-SEO-Q3" && /4 790/.test(item.summary)));
  assert.ok(universe.documents.some((item) => item.id === "SLK-FINANCE-20260716" && /12 400/.test(item.summary)));

  const currentAcquisition = new Map(
    universe.metrics
      .filter((item) => item.periodStart === "2026-07-01")
      .map((item) => [`${item.domain}.${item.metric}`, item.value]),
  );
  assert.equal(currentAcquisition.get("google-ads.clicks"), 428);
  assert.equal(currentAcquisition.get("instagram.views"), 18_400);
  assert.equal(currentAcquisition.get("instagram.saves"), 612);
  assert.equal(currentAcquisition.get("instagram.opportunities"), 1);
});

test("les agrégats métier correspondent exactement aux écrans OPS", () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  const aggregates = calculateUniverseAggregates(universe);

  assert.equal(aggregates.openPipelineCents, expectedUniverseAggregates.openPipelineCents);
  assert.equal(aggregates.outstandingReceivablesCents, expectedUniverseAggregates.outstandingReceivablesCents);
  assert.equal(aggregates.overdueReceivablesCents, expectedUniverseAggregates.overdueReceivablesCents);
  assert.equal(aggregates.currentMonthRevenueCents, expectedUniverseAggregates.currentMonthRevenueCents);
  assert.equal(aggregates.currentGrossMarginPercent, expectedUniverseAggregates.currentGrossMarginPercent);

  const open = universe.opportunities.filter((item) => ["qualification", "discovery", "proposal", "negotiation"].includes(item.stage));
  assert.deepEqual(open.map((item) => [item.name, item.amountCents]), [
    ["Aménagement Studio Cime", 2_000_000],
    ["Mobilier Maison Lenoir", 3_400_000],
    ["Rénovation Hôtel Orsay", 5_800_000],
    ["Extension Nova Hôtels", 7_200_000],
  ]);
});

test("les identifiants sont uniques et toutes les références sont résolues", () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  const allRecords = records(universe);
  const ids = allRecords.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate record id");

  const objectIds = new Set([
    ...universe.team.map((item) => item.id),
    ...allRecords.filter((item) => item.kind !== "relation" && item.kind !== "source-event").map((item) => item.id),
  ]);
  const clientIds = new Set(universe.clients.map((item) => item.id));
  const contactIds = new Set(universe.contacts.map((item) => item.id));
  const opportunityIds = new Set(universe.opportunities.map((item) => item.id));
  const projectIds = new Set(universe.projects.map((item) => item.id));
  const invoiceIds = new Set(universe.invoices.map((item) => item.id));
  const threadIds = new Set(universe.emailThreads.map((item) => item.id));
  const messageIds = new Set(universe.emailMessages.map((item) => item.id));
  const decisionIds = new Set(universe.decisions.map((item) => item.id));
  const taskIds = new Set(universe.tasks.map((item) => item.id));
  const documentIds = new Set(universe.documents.map((item) => item.id));
  const meetingIds = new Set(universe.meetings.map((item) => item.id));

  universe.contacts.forEach((item) => assert.ok(clientIds.has(item.clientId), item.id));
  universe.opportunities.forEach((item) => {
    assert.ok(clientIds.has(item.clientId), item.id);
    assert.ok(contactIds.has(item.primaryContactId), item.id);
  });
  universe.projects.forEach((item) => {
    assert.ok(clientIds.has(item.clientId), item.id);
    assert.ok(opportunityIds.has(item.opportunityId), item.id);
    item.teamMemberIds.forEach((id) => assert.ok(objectIds.has(id), `${item.id}:${id}`));
  });
  universe.invoices.forEach((item) => {
    assert.ok(clientIds.has(item.clientId), item.id);
    if (item.projectId) assert.ok(projectIds.has(item.projectId), item.id);
    assert.equal(item.amountIncludingTaxCents, item.amountExcludingTaxCents + item.taxCents, item.id);
    assert.ok(item.paidCents >= 0 && item.paidCents <= item.amountIncludingTaxCents, item.id);
  });
  universe.payments.forEach((item) => {
    assert.ok(invoiceIds.has(item.invoiceId), item.id);
    const invoice = universe.invoices.find((candidate) => candidate.id === item.invoiceId);
    assert.equal(item.amountCents, invoice?.paidCents, item.id);
  });
  universe.emailThreads.forEach((item) => {
    assert.ok(clientIds.has(item.clientId), item.id);
    item.contactIds.forEach((id) => assert.ok(contactIds.has(id), `${item.id}:${id}`));
    item.messageIds.forEach((id) => assert.ok(messageIds.has(id), `${item.id}:${id}`));
    assert.equal(item.messageIds.length, 7, item.id);
  });
  universe.emailMessages.forEach((item) => {
    assert.ok(threadIds.has(item.threadId), item.id);
    if (item.inReplyToId) assert.ok(messageIds.has(item.inReplyToId), item.id);
    item.attachmentDocumentIds.forEach((id) => assert.ok(documentIds.has(id), `${item.id}:${id}`));
  });
  universe.meetings.forEach((item) => {
    assert.ok(clientIds.has(item.clientId), item.id);
    assert.ok(documentIds.has(item.transcriptDocumentId), item.id);
    item.decisionIds.forEach((id) => assert.ok(decisionIds.has(id), `${item.id}:${id}`));
    item.taskIds.forEach((id) => assert.ok(taskIds.has(id), `${item.id}:${id}`));
  });
  universe.decisions.forEach((item) => {
    if (item.sourceMeetingId) assert.ok(meetingIds.has(item.sourceMeetingId), item.id);
  });
  universe.tasks.forEach((item) => {
    if (item.sourceDecisionId) assert.ok(decisionIds.has(item.sourceDecisionId), item.id);
  });
  universe.relations.forEach((item) => {
    assert.ok(objectIds.has(item.fromId), `${item.id}:from:${item.fromId}`);
    assert.ok(objectIds.has(item.toId), `${item.id}:to:${item.toId}`);
    item.evidenceIds.forEach((id) => assert.ok(objectIds.has(id), `${item.id}:evidence:${id}`));
  });
  universe.sourceEvents.forEach((item) => assert.ok(objectIds.has(item.objectId), `${item.id}:${item.objectId}`));
});

test("aucune donnée ingérée n'est datée après le snapshot", () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  const cutoff = Date.parse(universe.generatedAt);
  for (const item of records(universe)) {
    assert.ok(Date.parse(item.createdAt) <= cutoff, `${item.id}:createdAt:${item.createdAt}`);
    assert.ok(Date.parse(item.trace.sourceUpdatedAt) <= cutoff, `${item.id}:sourceUpdatedAt:${item.trace.sourceUpdatedAt}`);
    assert.ok(Date.parse(item.trace.ingestedAt) <= cutoff + 120_000, `${item.id}:ingestedAt:${item.trace.ingestedAt}`);
  }
});

test("le générateur est strictement déterministe pour un seed et sensible au seed", () => {
  const first = generateAtelierBeaumarchaisUniverse({ seed: "video-take-01" });
  const second = generateAtelierBeaumarchaisUniverse({ seed: "video-take-01" });
  const other = generateAtelierBeaumarchaisUniverse({ seed: "video-take-02" });

  assert.deepEqual(first, second);
  assert.notEqual(first.emailMessages[25].trace.checksum, other.emailMessages[25].trace.checksum);
  assert.notEqual(first.emailMessages[25].sentAt, other.emailMessages[25].sentAt);
  assert.deepEqual(calculateUniverseAggregates(first), calculateUniverseAggregates(other));
});

test("Vitreflam, Fabien, Trustpilot et les dossiers historiques forment des scénarios complets", () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  const vitreflam = universe.clients.find((item) => item.name === "Vitreflam");
  assert.ok(vitreflam);
  const fabien = universe.contacts.find((item) => item.fullName === "Fabien Morel");
  assert.equal(fabien?.clientId, vitreflam.id);
  const trustpilotThread = universe.emailThreads.find((item) => item.subject === "Demande concernant Trustpilot");
  assert.equal(trustpilotThread?.clientId, vitreflam.id);
  assert.equal(trustpilotThread?.status, "waiting-us");
  const trustpilotMessages = universe.emailMessages.filter((item) => item.threadId === trustpilotThread?.id);
  assert.equal(trustpilotMessages.length, 7);
  assert.match(trustpilotMessages[0].text, /lien de connexion Trustpilot.*ne fonctionne pas/i);
  assert.match(trustpilotMessages[5].text, /demain avant 11 h/i);
  assert.ok(universe.commitments.some((item) => item.contactId === fabien.id && /lien Trustpilot testé/i.test(item.description)));

  assert.ok(universe.projects.some((item) => item.id === "PROJET-241" && item.status === "at-risk"));
  assert.ok(universe.documents.some((item) => item.id === "ALERT-201" && /82 %/.test(item.summary)));
  assert.ok(universe.documents.some((item) => item.id === "SEO-SNAPSHOT-20260716"));
  assert.ok(universe.invoices.some((item) => item.id === "FACT-879" && item.amountIncludingTaxCents === 1_240_000));
  assert.ok(universe.invoices.some((item) => item.id === "FACT-886" && item.amountIncludingTaxCents === 780_000));
  assert.ok(universe.decisions.some((item) => item.id === "VAL-061" && /20,2 K€/.test(item.title)));
  assert.ok(universe.decisions.some((item) => item.id === "VAL-063" && /avenant Rivoli/i.test(item.title)));
});

test("la mémoire contient une vraie journée de boîte de réception récente", () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  const inbox = universe.emailMessages.filter((message) => (
    message.direction === "inbound" && message.sentAt.startsWith("2026-07-16")
  ));
  assert.equal(inbox.length, 11);
  assert.ok(inbox.some((message) => message.subject.includes("Trustpilot")));
  assert.ok(inbox.every((message) => message.requiresAction));
});

test("chaque événement conserve une provenance exploitable par une future base centrale", () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  for (const item of records(universe)) {
    assert.equal(item.tenantId, universe.tenant.id, item.id);
    assert.ok(item.trace.sourceId.length > 3, item.id);
    assert.match(item.trace.checksum, /^[a-f0-9]{32}$/, item.id);
    assert.equal(item.version, 1, item.id);
    assert.equal(item.deletedAt, null, item.id);
  }
  assert.equal(universe.sourceEvents.length, records(universe).filter((item) => item.kind !== "relation" && item.kind !== "source-event").length);
});

test("l'export NDJSON suit un ordre d'import stable et ne perd aucun enregistrement", () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  const lines = serializeUniverseAsNdjson(universe).split("\n").map((line) => JSON.parse(line) as {
    schema_version: string;
    tenant_id: string;
    table: string;
    data: { id: string };
  });
  const expectedCount = centralMemoryImportOrder.reduce((sum, table) => sum + universe[table].length, 0);

  assert.equal(lines.length, expectedCount);
  assert.equal(lines[0].table, "clients");
  assert.equal(lines.at(-1)?.table, "sourceEvents");
  assert.ok(lines.every((line) => line.schema_version === "1.0"));
  assert.ok(lines.every((line) => line.tenant_id === universe.tenant.id));
  assert.equal(new Set(lines.map((line) => line.data.id)).size, lines.length);
});
