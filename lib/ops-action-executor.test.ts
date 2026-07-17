import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResultRow } from "pg";
import {
  ControlledActionError,
  canonicalOpsActionType,
  createActionIdempotencyKey,
  executeControlledOpsAction,
  isSafeInternalEmailRecipient,
  mirrorControlledRecordMutation,
  type ExecutableOpsAction,
} from "@/lib/ops-action-executor";
import type { CentralMemoryPool } from "@/lib/central-memory/database";

const opportunity: ExecutableOpsAction = {
  type: "create_opportunity",
  execution: "execute",
  reason: "Ajout explicite au pipeline.",
  name: "Extension Galerie Voltaire",
  amount: 48_000,
  stage: "Qualification",
  probability: 35,
  owner: "Camille Laurent",
  source: "Recommandation",
  next: "Planifier la visite technique",
  company: "Galerie Voltaire",
  linked: [],
};

const safeEmail: ExecutableOpsAction = {
  type: "send_demo_email",
  execution: "execute",
  reason: "Envoi explicitement validé.",
  subject: "Compte rendu",
  to: "fabien@vitreflam.example",
  body: "Bonjour Fabien, voici le compte rendu convenu.",
  company: "Vitreflam",
  threadId: "THREAD-VITREFLAM-001",
  linked: [],
};

type StoredActionRun = {
  id: string;
  status: string;
  output: unknown;
  external_receipt: unknown;
};

class FakeCentralMemory {
  events: string[] = [];
  actionRun: StoredActionRun | null = null;
  sourceObjectWrites = 0;
  entityWrites = 0;
  taskWrites = 0;
  insertedTaskStatus = "";
  taskUpdates = 0;
  entityUpdates = 0;
  auditWrites = 0;
  projectionStatus = "";

  async execute<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: unknown[] = [],
  ) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
      this.events.push(normalized.toLocaleLowerCase("en"));
      return { rows: [], rowCount: null, command: normalized, oid: 0, fields: [] };
    }
    if (normalized.startsWith("SELECT id FROM ops_memory.organizations")) {
      return { rows: [{ id: "org-001" }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
    }
    if (normalized.startsWith("INSERT INTO ops_memory.action_runs")) {
      if (this.actionRun) {
        return { rows: [], rowCount: 0, command: "INSERT", oid: 0, fields: [] };
      }
      this.actionRun = {
        id: "run-001",
        status: "running",
        output: null,
        external_receipt: null,
      };
      this.events.push("action_run_inserted");
      return { rows: [{ ...this.actionRun }], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
    }
    if (normalized.startsWith("SELECT id, status, output, external_receipt FROM ops_memory.action_runs")) {
      return {
        rows: this.actionRun ? [{ ...this.actionRun }] : [],
        rowCount: this.actionRun ? 1 : 0,
        command: "SELECT",
        oid: 0,
        fields: [],
      };
    }
    if (normalized.startsWith("INSERT INTO ops_memory.source_events")) {
      this.events.push("source_event_written");
      return { rows: [{ id: "event-001" }], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
    }
    if (normalized.startsWith("INSERT INTO ops_memory.source_objects")) {
      this.sourceObjectWrites += 1;
      this.events.push("source_object_written");
      return { rows: [{ id: "source-object-001" }], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
    }
    if (normalized.startsWith("INSERT INTO ops_memory.entities")) {
      this.entityWrites += 1;
      return { rows: [], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
    }
    if (normalized.startsWith("INSERT INTO ops_memory.tasks")) {
      this.taskWrites += 1;
      this.insertedTaskStatus = String(values[4]);
      return { rows: [], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
    }
    if (normalized.startsWith("UPDATE ops_memory.tasks SET")) {
      this.taskUpdates += 1;
      return { rows: [], rowCount: 1, command: "UPDATE", oid: 0, fields: [] };
    }
    if (normalized.startsWith("UPDATE ops_memory.entities SET")) {
      this.entityUpdates += 1;
      return { rows: [], rowCount: 1, command: "UPDATE", oid: 0, fields: [] };
    }
    if (normalized.startsWith("UPDATE ops_memory.action_runs SET")) {
      assert.ok(this.actionRun);
      this.actionRun.status = "succeeded";
      this.actionRun.output = JSON.parse(String(values[1]));
      if (normalized.includes("external_receipt")) {
        this.actionRun.external_receipt = JSON.parse(String(values[2]));
      }
      this.events.push("action_run_succeeded");
      return { rows: [], rowCount: 1, command: "UPDATE", oid: 0, fields: [] };
    }
    if (normalized.startsWith("INSERT INTO ops_memory.knowledge_projections")) {
      this.projectionStatus = "pending";
      return { rows: [], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
    }
    if (normalized.startsWith("INSERT INTO ops_memory.audit_logs")) {
      this.auditWrites += 1;
      return { rows: [], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
    }
    if (normalized.startsWith("UPDATE ops_memory.knowledge_projections projection SET")) {
      this.projectionStatus = String(values[2]);
      this.events.push(`projection_${this.projectionStatus}`);
      return { rows: [], rowCount: 1, command: "UPDATE", oid: 0, fields: [] };
    }
    throw new Error(`Unhandled SQL in fake central memory: ${normalized}`);
  }

  pool(): CentralMemoryPool {
    return {
      query: (sql, values) => this.execute(sql, values),
      connect: async () => ({
        query: (sql, values) => this.execute(sql, values),
        release: () => this.events.push("released"),
      }),
      end: async () => undefined,
    } as CentralMemoryPool;
  }
}

function projectedRecord(id: string, title: string) {
  return {
    id,
    title,
    relativePath: `00_Actions/${id}.md`,
    absolutePath: `/vault/00_Actions/${id}.md`,
    createdAt: "2026-07-17T08:00:00.000Z",
  };
}

test("le type email historique devient send_email et les clés sont stables", () => {
  assert.equal(canonicalOpsActionType("send_demo_email"), "send_email");
  assert.equal(canonicalOpsActionType("prepare_email"), "prepare_email");
  assert.equal(
    createActionIdempotencyKey(opportunity),
    createActionIdempotencyKey({ ...opportunity }),
  );
  assert.notEqual(
    createActionIdempotencyKey(opportunity),
    createActionIdempotencyKey({ ...opportunity, amount: 49_000 }),
  );
});

test("la boîte d'envoi contrôlée n'accepte que le domaine réservé .example", () => {
  assert.equal(isSafeInternalEmailRecipient("fabien@vitreflam.example"), true);
  assert.equal(isSafeInternalEmailRecipient("ops@example"), true);
  assert.equal(isSafeInternalEmailRecipient("direction@vitreflam.fr"), false);
  assert.equal(isSafeInternalEmailRecipient("not-an-email"), false);
});

test("sans DATABASE_URL, le fallback Obsidian reste disponible", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let projected = 0;
  try {
    const result = await executeControlledOpsAction(opportunity, {
      idempotencyKey: "fallback-opportunity-001",
      now: () => new Date("2026-07-17T08:00:00.000Z"),
      projectToObsidian: async (_action, context) => {
        projected += 1;
        return projectedRecord(context.recordId, "Extension Galerie Voltaire");
      },
    });
    assert.equal(result.centralMemory, false);
    assert.equal(result.status, "succeeded");
    assert.equal(result.actionRunId, null);
    assert.equal(projected, 1);
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});

test("un destinataire réel est refusé avant toute écriture ou projection", async () => {
  const memory = new FakeCentralMemory();
  let projections = 0;
  await assert.rejects(
    executeControlledOpsAction({ ...safeEmail, to: "fabien@vitreflam.fr" }, {
      pool: memory.pool(),
      idempotencyKey: "unsafe-email-001",
      projectToObsidian: async (_action, context) => {
        projections += 1;
        return projectedRecord(context.recordId, "Ne doit pas exister");
      },
    }),
    (error: unknown) => (
      error instanceof ControlledActionError && error.code === "unsafe_email_recipient"
    ),
  );
  assert.equal(memory.actionRun, null);
  assert.equal(projections, 0);
});

test("un email contrôlé est commité, audité et reçu avant d'être projeté", async () => {
  const memory = new FakeCentralMemory();
  const result = await executeControlledOpsAction(safeEmail, {
    pool: memory.pool(),
    idempotencyKey: "safe-email-001",
    requestedBy: "marie-delmas",
    approvedBy: "Marie Delmas",
    now: () => new Date("2026-07-17T08:00:00.000Z"),
    projectToObsidian: async (_action, context) => {
      memory.events.push("obsidian_projected");
      assert.equal(context.receipt?.deliveryState, "accepted");
      assert.equal(context.receipt?.networkDelivery, false);
      return projectedRecord(context.recordId, "Compte rendu");
    },
  });

  assert.equal(result.centralMemory, true);
  assert.equal(result.actionType, "send_email");
  assert.equal(result.receipt?.provider, "ops_internal_outbox");
  assert.equal(result.receipt?.recipient, "fabien@vitreflam.example");
  assert.equal(result.receipt?.networkDelivery, false);
  assert.equal(memory.actionRun?.status, "succeeded");
  assert.equal(memory.sourceObjectWrites, 1);
  assert.equal(memory.auditWrites, 1);
  assert.equal(memory.projectionStatus, "projected");
  assert.ok(memory.events.indexOf("commit") < memory.events.indexOf("obsidian_projected"));
});

test("la même idempotency_key ne crée jamais deux actions métier", async () => {
  const memory = new FakeCentralMemory();
  let projections = 0;
  const options = {
    pool: memory.pool(),
    idempotencyKey: "same-opportunity-001",
    projectToObsidian: async (_action: ExecutableOpsAction, context: { recordId: string }) => {
      projections += 1;
      return projectedRecord(context.recordId, "Extension Galerie Voltaire");
    },
  };
  const first = await executeControlledOpsAction(opportunity, options);
  const second = await executeControlledOpsAction(opportunity, options);

  assert.equal(first.recordId, second.recordId);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(memory.sourceObjectWrites, 1);
  assert.equal(memory.entityWrites, 1);
  assert.equal(memory.auditWrites, 1);
  assert.equal(projections, 2);
});

test("une projection Obsidian en échec est marquée et peut être rejouée sans doublon", async () => {
  const memory = new FakeCentralMemory();
  await assert.rejects(
    executeControlledOpsAction(opportunity, {
      pool: memory.pool(),
      idempotencyKey: "projection-retry-001",
      projectToObsidian: async () => {
        throw new Error("vault temporarily unavailable");
      },
    }),
    (error: unknown) => (
      error instanceof ControlledActionError && error.code === "projection_failed"
    ),
  );
  assert.equal(memory.actionRun?.status, "succeeded");
  assert.equal(memory.projectionStatus, "failed");

  const retried = await executeControlledOpsAction(opportunity, {
    pool: memory.pool(),
    idempotencyKey: "projection-retry-001",
    projectToObsidian: async (_action, context) => (
      projectedRecord(context.recordId, "Extension Galerie Voltaire")
    ),
  });
  assert.equal(retried.replayed, true);
  assert.equal(memory.sourceObjectWrites, 1);
  assert.equal(memory.entityWrites, 1);
  assert.equal(memory.projectionStatus, "projected");
});

test("create_task écrit la table métier dédiée dans la même transaction", async () => {
  const memory = new FakeCentralMemory();
  const task: ExecutableOpsAction = {
    type: "create_task",
    execution: "execute",
    reason: "Mission validée.",
    title: "Vérifier le budget Rivoli",
    owner: "Marie Delmas",
    due: "2026-07-18",
    description: "Comparer le réalisé au budget validé.",
    project: "Rivoli",
    status: "in_progress",
    dayIndex: 2,
    weekOffset: 1,
    linked: ["PROJET-241"],
  };
  await executeControlledOpsAction(task, {
    pool: memory.pool(),
    idempotencyKey: "task-001",
    projectToObsidian: async (_action, context) => (
      projectedRecord(context.recordId, "Vérifier le budget Rivoli")
    ),
  });
  assert.equal(memory.taskWrites, 1);
  assert.equal(memory.insertedTaskStatus, "in_progress");
  assert.equal(memory.sourceObjectWrites, 1);
  assert.equal(memory.auditWrites, 1);
});

test("un PATCH UI est journalisé dans action_runs et répercuté dans la mémoire centrale", async () => {
  const memory = new FakeCentralMemory();
  const mutation = {
    id: "TASK-RIVOLI-001",
    kind: "task" as const,
    title: "Vérifier le budget Rivoli",
    patch: {
      title: "Vérifier le budget Rivoli",
      description: "Contrôle effectué avec les achats actualisés.",
      status: "done",
    },
  };
  const first = await mirrorControlledRecordMutation(mutation, {
    pool: memory.pool(),
    idempotencyKey: "patch-task-001",
    now: () => new Date("2026-07-17T09:00:00.000Z"),
  });
  const replay = await mirrorControlledRecordMutation(mutation, {
    pool: memory.pool(),
    idempotencyKey: "patch-task-001",
    now: () => new Date("2026-07-17T09:00:00.000Z"),
  });
  assert.equal(first.centralMemory, true);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(memory.taskUpdates, 1);
  assert.equal(memory.sourceObjectWrites, 1);
  assert.equal(memory.auditWrites, 1);
});
