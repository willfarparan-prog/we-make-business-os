import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

test("server action modules export only async functions (types are erased)", async () => {
  const dir = new URL("../../src/app/actions/", import.meta.url);
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".ts")) continue;
    const text = await readFile(new URL(name, dir), "utf8");
    if (!/^['"]use server['"];/.test(text)) continue;
    const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
      if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      assert.ok(ts.isFunctionDeclaration(statement) && statement.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword), `${name} exports runtime data or a synchronous function`);
    }
  }
});
