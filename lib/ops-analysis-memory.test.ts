import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { persistSourcedAgentAnalysis } from "@/lib/ops-analysis-memory";

test("une analyse sourcée devient une note dérivée reliée dans Obsidian", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ops-analysis-"));
  const previousVault = process.env.OBSIDIAN_VAULT_PATH;
  process.env.OBSIDIAN_VAULT_PATH = root;
  t.after(async () => {
    if (previousVault === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = previousVault;
    await fs.rm(root, { recursive: true, force: true });
  });

  const result = await persistSourcedAgentAnalysis({
    question: "Quel est le bilan SEO du jour ?",
    answer: "Les clics progressent et trois correctifs techniques restent prioritaires.",
    sources: ["SEO-SNAPSHOT-20260716", "SEO-TECH-20260716", "SEO-TECH-20260716"],
  });

  assert.ok(result);
  const markdown = await fs.readFile(result.absolutePath, "utf8");
  assert.match(markdown, /^type: "analysis"$/m);
  assert.match(markdown, /^derived: true$/m);
  assert.match(markdown, /^source_count: 2$/m);
  assert.match(markdown, /\[\[SEO-SNAPSHOT-20260716\]\]/);
  assert.match(markdown, /\[\[SEO-TECH-20260716\]\]/);
  assert.match(markdown, /Quel est le bilan SEO du jour/);
});

test("un échange sans preuve ne pollue pas la mémoire", async () => {
  const result = await persistSourcedAgentAnalysis({
    question: "Salut, ça va ?",
    answer: "Oui, merci.",
    sources: [],
  });
  assert.equal(result, null);
});
