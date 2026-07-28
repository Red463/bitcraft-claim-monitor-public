import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript/lib/typescript.js";

const srcRoot = fileURLToPath(new URL("../src", import.meta.url));
const settlementWord = /\bsettlements?\b/i;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "server" || entry.name === "styles") return [];
      return sourceFiles(target);
    }
    return /\.(?:ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.mts") ? [target] : [];
  });
}

function technicalCompatibilityLiteral(text, relativeFile) {
  return text === "settlement-market"
    || text.includes("claim-monitor.settlement.")
    || text.includes("page=settlement-market")
    || /^settlement\.$/i.test(text)
    || (!/\s/.test(text) && text.includes("settlement-"))
    || (text === "settlement" && new Set([
      "AppShell.tsx",
      "navigation.ts",
      "pages/market/BuyOrderFinder.tsx",
      "pages/PublicCraftFinderPage.tsx",
      "pages/ResearchPage.tsx",
    ]).has(relativeFile));
}

function isModuleSpecifier(node) {
  return (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent))
    && node.parent.moduleSpecifier === node;
}

function isMachineJsxAttribute(node) {
  let parent = node.parent;
  while (parent && !ts.isJsxElement(parent) && !ts.isJsxSelfClosingElement(parent)) {
    if (ts.isJsxAttribute(parent)) {
      const name = parent.name.getText();
      return name === "className" || name === "id" || name === "key" || name.startsWith("data-");
    }
    parent = parent.parent;
  }
  return false;
}

function renderableSettlementLiterals(file) {
  const sourceText = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const failures = [];
  const relativeFile = path.relative(srcRoot, file).replaceAll(path.sep, "/");

  function inspect(node) {
    const isTextNode = ts.isStringLiteral(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node)
      || ts.isTemplateTail(node)
      || ts.isJsxText(node);
    if (isTextNode && !isModuleSpecifier(node) && !isMachineJsxAttribute(node)) {
      const text = node.text;
      if (settlementWord.test(text) && !technicalCompatibilityLiteral(text, relativeFile)) {
        const location = source.getLineAndCharacterOfPosition(node.getStart(source));
        failures.push(`${relativeFile}:${location.line + 1}: ${JSON.stringify(text.trim())}`);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(source);
  return failures;
}

test("public source uses claim terminology in renderable strings", () => {
  const failures = sourceFiles(srcRoot).flatMap(renderableSettlementLiterals);
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("the public product name is BitCraft Claim Monitor", () => {
  const sources = [
    ["README.md", readFileSync(new URL("../../../README.md", import.meta.url), "utf8")],
    ["AppShell.tsx", readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8")],
    ["SettlementPicker.tsx", readFileSync(new URL("../src/settlements/SettlementPicker.tsx", import.meta.url), "utf8")],
    ["legalPolicy.mjs", readFileSync(new URL("../src/legal/legalPolicy.mjs", import.meta.url), "utf8")],
    ["server.mjs", readFileSync(new URL("../server.mjs", import.meta.url), "utf8")],
  ];
  for (const [name, source] of sources) {
    assert.match(source, /BitCraft Claim Monitor/, name);
    assert.doesNotMatch(source, /BitCraft Settlement Monitor/, name);
  }
});
