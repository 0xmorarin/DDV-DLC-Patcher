import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const root = new URL("../", import.meta.url);
const slash = String.fromCharCode(47);
const star = String.fromCharCode(42);
const angle = String.fromCharCode(60);
const bang = String.fromCharCode(33);
const dash = String.fromCharCode(45);

async function collect(directory = ".") {
  const entries = await readdir(new URL(directory + "/", root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function scriptHasComment(source) {
  const stack = [{ mode: "code", canRegex: true, depth: null }];
  let i = 0;
  while (i < source.length) {
    const state = stack[stack.length - 1];
    const c = source[i];
    const next = source[i + 1];

    if (state.mode === "string") {
      if (c === "\\") { i += 2; continue; }
      if (c === state.close) stack.pop();
      i++;
      continue;
    }

    if (state.mode === "regex") {
      if (c === "\\") { i += 2; continue; }
      if (c === "[") state.brackets++;
      if (c === "]" && state.brackets) state.brackets--;
      if (c === slash && !state.brackets) stack.pop();
      i++;
      continue;
    }

    if (state.mode === "template") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { stack.pop(); i++; continue; }
      if (c === "$" && next === "{") {
        stack.push({ mode: "code", canRegex: true, depth: 1 });
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (/\s/.test(c)) { i++; continue; }
    if (c === slash && (next === slash || next === star)) return true;
    if (c === "'" || c === '"') {
      stack.push({ mode: "string", close: c });
      state.canRegex = false;
      i++;
      continue;
    }
    if (c === "`") {
      stack.push({ mode: "template" });
      state.canRegex = false;
      i++;
      continue;
    }
    if (c === slash && state.canRegex) {
      stack.push({ mode: "regex", brackets: 0 });
      state.canRegex = false;
      i++;
      continue;
    }
    if (c === "{" && state.depth !== null) state.depth++;
    if (c === "}" && state.depth !== null) {
      state.depth--;
      if (state.depth === 0) { stack.pop(); i++; continue; }
    }
    const word = source.slice(i).match(/^[A-Za-z_$][\w$]*/);
    if (word) {
      state.canRegex = /^(?:return|throw|case|yield|void|delete|typeof|new|in|instanceof|await)$/.test(word[0]);
      i += word[0].length;
      continue;
    }
    if (/[\d]/.test(c)) {
      state.canRegex = false;
      i++;
      continue;
    }
    state.canRegex = !/[)\]}]/.test(c);
    i++;
  }
  return false;
}

function cssHasComment(source) {
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === slash && source[i + 1] === star) {
      return true;
    }
  }
  return false;
}

function yamlHasComment(source) {
  for (const line of source.split("\n")) {
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"') {
        quote = c;
      } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        return true;
      }
    }
  }
  return false;
}

test("all repository source and documents contain no comments", async () => {
  const violations = [];
  for (const path of await collect()) {
    const extension = extname(path).toLowerCase();
    const source = await readFile(new URL(path.replaceAll("\\", "/"), root), "utf8");
    const htmlComment = source.includes(angle + bang + dash + dash);
    let found = false;
    if (extension === ".js" || extension === ".mjs") found = scriptHasComment(source);
    else if (extension === ".css") found = cssHasComment(source);
    else if (extension === ".html" || extension === ".md") found = htmlComment;
    else if (extension === ".yml" || extension === ".yaml") found = yamlHasComment(source);
    else if (extension === ".json") assert.doesNotThrow(() => JSON.parse(source), path);
    if (found) violations.push(path);
  }
  assert.deepEqual(violations, []);
});
