import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { agentScenarios, brainNodes, companyContext } from "./ops-demo-data";

const componentUrl = new URL("../components/ops-app.tsx", import.meta.url);
const brainGraphUrl = new URL("../components/brain-graph.tsx", import.meta.url);
const publicDocumentUrls = [
  new URL("../README.md", import.meta.url),
  new URL("../deploy/README.md", import.meta.url),
];
const seedContentUrl = new URL("../scripts/seed-obsidian.mjs", import.meta.url);
const PUBLIC_DATA_MARKER = /\b(?:d[ée]monstration|d[ée]mo|test|ficti(?:f|ve|ves|fs))\b/i;

async function loadComponent() {
  const source = await readFile(componentUrl, "utf8");
  const file = ts.createSourceFile(
    componentUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return { file, source };
}

function jsxAttributes(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  file: ts.SourceFile,
) {
  return new Map(node.attributes.properties.flatMap((attribute) => {
    if (!ts.isJsxAttribute(attribute)) return [];
    return [[attribute.name.getText(file), attribute.initializer?.getText(file) ?? ""]] as const;
  }));
}

test("chaque bouton OPS visible déclenche une action ou soumet un formulaire", async () => {
  const { file } = await loadComponent();
  const inertButtons: number[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === "button") {
      const attributes = jsxAttributes(node.openingElement, file);
      const submits = attributes.get("type") === '"submit"';
      if (!attributes.has("onClick") && !submits) {
        inertButtons.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  assert.deepEqual(inertButtons, []);
});

test("les cartes non-button restent utilisables au clavier", async () => {
  const { file } = await loadComponent();
  const inaccessibleCards: number[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      const attributes = jsxAttributes(node.openingElement, file);
      if (attributes.get("role") === '"button"') {
        const accessible = attributes.has("onClick")
          && attributes.has("onKeyDown")
          && attributes.get("tabIndex") === "{0}"
          && attributes.has("aria-label");
        if (!accessible) {
          inaccessibleCards.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  assert.deepEqual(inaccessibleCards, []);
});

test("les quatre écritures pilotables passent par l'API records", async () => {
  const { source } = await loadComponent();

  for (const kind of ["email", "client", "task", "opportunity"]) {
    assert.match(source, new RegExp(`kind:\\s*["']${kind}["']`));
  }
  assert.match(source, /fetch\("\/api\/records"/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /method:\s*"PATCH"/);
  assert.match(source, /updateOpsRecord\(created\.id,\s*payload\)/);
  assert.match(source, /openNewOpportunity/);
  assert.match(source, /thread\.id === threadId && thread\.unread/);
  assert.match(source, /records\.filter\(\(record\) => !isInternalEmailRecord\(record\)\)/);
  assert.match(source, /emailPreview\(record, sent\)/);
});

test("l'interface filmée n'affiche aucun marqueur de données factices", async () => {
  const { file } = await loadComponent();
  const brainGraphSource = await readFile(brainGraphUrl, "utf8");
  const brainGraph = ts.createSourceFile(
    brainGraphUrl.pathname,
    brainGraphSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visibleText: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && node.text.trim()) visibleText.push(node.text.trim());
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      visibleText.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  visit(brainGraph);

  assert.doesNotMatch(
    visibleText.join("\n"),
    PUBLIC_DATA_MARKER,
  );
});

test("les contenus de continuité affichables ne contiennent aucun marqueur public", async () => {
  const seededContent = await readFile(seedContentUrl, "utf8");
  assert.doesNotMatch(
    `${JSON.stringify({ agentScenarios, brainNodes, companyContext })}\n${seededContent}`,
    PUBLIC_DATA_MARKER,
  );
});

test("la documentation publique ne présente aucun marqueur public", async () => {
  const publicDocumentation = await Promise.all(
    publicDocumentUrls.map((url) => readFile(url, "utf8")),
  );
  assert.doesNotMatch(publicDocumentation.join("\n"), PUBLIC_DATA_MARKER);
});
