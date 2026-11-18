import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { diffProtoDb, inspectProtoDb, parseProtoFields } from "../tools/inspect-protodb-iap.mjs";

const execute = promisify(execFile);
const encoder = new TextEncoder();

function concat(...parts) {
  return Uint8Array.from(parts.flatMap(value => [...value]));
}

function varint(number) {
  let value = BigInt(number);
  const out = [];
  do {
    const bits = Number(value & 127n);
    value >>= 7n;
    out.push(value > 0n ? bits | 128 : bits);
  } while (value > 0n);
  return Uint8Array.from(out);
}

function wireVarint(field, number) {
  return concat(varint(field * 8), varint(number));
}

function wireBytes(field, bytes) {
  const source = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  return concat(varint(field * 8 + 2), varint(source.length), source);
}

function definition(kind, payload) {
  const wrapper = concat(wireBytes(5, kind), wireBytes(6, payload));
  return wireBytes(1, wireBytes(2, wrapper));
}

function group(name) {
  return definition("Definitions.StoreFrontGroup",
    concat(wireBytes(2, name), wireBytes(3, varint(1)), wireVarint(6, 7)));
}

function productMap(field, marketplace, sku) {
  return wireBytes(field, concat(wireVarint(1, marketplace), wireBytes(2, wireBytes(1, sku))));
}

function epicMap(sku) {
  return wireBytes(13, wireBytes(2, wireBytes(1, sku)));
}

function iap(name, expansion, xbox = false) {
  const products = concat(productMap(12, 1, "NintendoSKU"), epicMap("EpicSKU"),
    xbox ? productMap(12, 4, "XboxSKU") : new Uint8Array());
  const record = concat(wireBytes(1, name), wireVarint(5, 2), wireBytes(6, expansion), products);
  return definition("Definitions.IAPData", record);
}

function database(names) {
  return concat(group("Nintendo"), group("Epic"), ...names.map(([name, expansion, xbox]) => iap(name, expansion, xbox)));
}

test("standalone protobuf scanner recognizes IAP UniqueName, AssociatedExpansion, marketplace and Epic default key", () => {
  const evidence = inspectProtoDb(database([["Expansion1PackExpansionPass", "Expansion01", false]]));
  assert.equal(evidence.IAPCount, 1);
  assert.equal(evidence.StoreFrontGroupCount, 2);
  assert.equal(evidence.sha256.length, 64);
  assert.deepEqual(evidence.IAPData, [{
    UniqueName: "Expansion1PackExpansionPass",
    Type: 2,
    AssociatedExpansion: "Expansion01",
    StoreFrontProductMarkets: ["Nintendo"],
    CustomStoreFrontProductMarkets: ["Epic"]
  }]);
  assert.ok(evidence.StoreFrontGroups.some(item => item.UniqueName === "Nintendo" &&
    item.SupportedStoreFront.includes("Nintendo")));
});

test("IAP comparator identifies added definitions and changed marketplace maps without assuming DLC ownership", () => {
  const baseline = inspectProtoDb(database([["Expansion1PackExpansionPass", "Expansion01", false]]));
  const candidate = inspectProtoDb(database([
    ["Expansion1PackExpansionPass", "Expansion01", true],
    ["ResearchSyntheticNextPass", "ResearchExpansion", false]
  ]));
  const diff = diffProtoDb(baseline, candidate);
  assert.deepEqual(diff.addedIAP.map(item => item.UniqueName), ["ResearchSyntheticNextPass"]);
  assert.equal(diff.changedIAP.length, 1);
  assert.deepEqual(diff.changedIAP[0].after.StoreFrontProductMarkets, ["Nintendo", "Xbox"]);
  assert.equal(diff.removedIAP.length, 0);
  assert.match(diff.warnings.join(" "), /not automatic DLC identification/);
});

test("unrecognized protobuf format, truncated varint and duplicate IAP identity fail closed", () => {
  assert.throws(() => parseProtoFields(Uint8Array.of(0x80)), /varint/);
  assert.throws(() => inspectProtoDb(Uint8Array.of(0x01, 0x02, 0x03)), /field tag|wire type|protobuf/);
  assert.throws(() => inspectProtoDb(concat(group("Nintendo"), iap("Repeated", "Expansion01"),
    iap("Repeated", "Expansion02"))), /duplicate IAP/);
});

test("offline protoDb CLI emits exact local IAP delta and refuses overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ddv-protodb-"));
  try {
    const oldPath = join(dir, "old.bin");
    const newPath = join(dir, "new.bin");
    const reportPath = join(dir, "iap-delta.json");
    await writeFile(oldPath, database([["Expansion1PackExpansionPass", "Expansion01", false]]));
    await writeFile(newPath, database([
      ["Expansion1PackExpansionPass", "Expansion01", false],
      ["ResearchSyntheticNextPass", "ResearchExpansion", true]
    ]));
    const runner = new URL("../tools/inspect-protodb-iap.mjs", import.meta.url);
    const args = [runner.pathname, "--before", oldPath, "--after", newPath, "--output", reportPath];
    const { stdout } = await execute(process.execPath, args, { timeout: 20000 });
    assert.match(stdout, /report created locally/);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(report.addedIAP[0].UniqueName, "ResearchSyntheticNextPass");
    assert.equal(report.addedIAP[0].AssociatedExpansion, "ResearchExpansion");
    await assert.rejects(() => execute(process.execPath, args, { timeout: 20000 }), /EEXIST/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
