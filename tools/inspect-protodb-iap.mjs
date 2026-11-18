import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const markets = Object.freeze({
  0: "Apple", 1: "Nintendo", 2: "OneStore", 3: "Windows", 4: "Xbox",
  5: "Steam", 6: "MicrosoftStore", 7: "NintendoEShop", 8: "PlayStationStore",
  9: "AppleAppStore", 200: "PS4_SEIE", 201: "PS4_SEIA", 202: "PS5_SEIE",
  203: "PS5_SEIA"
});

function readVarint(bytes, offset) {
  let value = 0n;
  let shift = 0n;
  for (let count = 0; count < 10 && offset < bytes.length; count++) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) {
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        return { value: value.toString(), offset };
      }
      return { value: Number(value), offset };
    }
    shift += 7n;
  }
  throw new Error("Invalid protobuf varint.");
}

export function parseProtoFields(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const fields = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    if (!Number.isSafeInteger(tag.value) || tag.value <= 0) {
      throw new Error("Invalid protobuf field tag.");
    }
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    if (field <= 0) throw new Error("Invalid protobuf field index.");
    let value = null;
    if (wire === 0) {
      const found = readVarint(bytes, offset);
      value = found.value;
      offset = found.offset;
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      if (!Number.isSafeInteger(length.value) || length.value > bytes.length - length.offset) {
        throw new Error("Invalid protobuf length.");
      }
      value = bytes.subarray(length.offset, length.offset + length.value);
      offset = length.offset + length.value;
    } else if (wire === 1 || wire === 5) {
      const count = wire === 1 ? 8 : 4;
      if (offset + count > bytes.length) throw new Error("Truncated protobuf fixed-size field.");
      offset += count;
    } else {
      throw new Error("Unsupported protobuf wire type.");
    }
    fields.push({ field, wire, value });
  }
  return fields;
}

function first(fields, field) {
  return fields.find(value => value.field === field)?.value;
}

function decode(value) {
  if (value instanceof Uint8Array) return new TextDecoder("utf-8", { fatal: true }).decode(value);
  if (value === undefined || value === null) return null;
  return String(value);
}

function enumValues(value) {
  if (value.wire === 0) return [value.value];
  if (value.wire !== 2) throw new Error("Unsupported marketplace enum representation.");
  const values = [];
  let offset = 0;
  while (offset < value.value.length) {
    const part = readVarint(value.value, offset);
    values.push(part.value);
    offset = part.offset;
  }
  return values;
}

function names(values, custom = false) {
  const out = [];
  for (const value of values) {
    const name = custom && value === 0 ? "Epic" : markets[value] ?? String(value);
    if (!out.includes(name)) out.push(name);
  }
  return out.sort();
}

function storeList(fields, field, custom = false) {
  const entries = [];
  for (const row of fields.filter(item => item.field === field && item.wire === 2)) {
    const map = parseProtoFields(row.value);
    const id = first(map, 1) ?? 0;
    const dataBytes = first(map, 2);
    if (!(dataBytes instanceof Uint8Array)) continue;
    const data = parseProtoFields(dataBytes);
    if (!data.some(item => item.wire === 2 && item.value.length > 0)) continue;
    entries.push(custom && id === 0 ? "Epic" : markets[id] ?? String(id));
  }
  return [...new Set(entries)].sort();
}

function group(fields) {
  const name = decode(first(fields, 2));
  if (!name) throw new Error("A StoreFrontGroup has no UniqueName.");
  const supported = fields.filter(item => item.field === 3).flatMap(enumValues);
  const custom = fields.filter(item => item.field === 4).flatMap(enumValues);
  const playFab = first(fields, 6) ?? 0;
  return {
    UniqueName: name,
    SupportedStoreFront: names(supported),
    CustomStoreFront: names(custom, true),
    PlayFabStoreFront: markets[playFab] ?? String(playFab)
  };
}

function iap(fields) {
  const UniqueName = decode(first(fields, 1));
  if (!UniqueName) throw new Error("An IAPData record has no UniqueName.");
  const Type = first(fields, 5) ?? null;
  const AssociatedExpansion = decode(first(fields, 6));
  return {
    UniqueName,
    Type,
    AssociatedExpansion,
    StoreFrontProductMarkets: storeList(fields, 12),
    CustomStoreFrontProductMarkets: storeList(fields, 13, true)
  };
}

export function inspectProtoDb(raw) {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const groups = [];
  const iaps = [];
  let definitionCount = 0;
  for (const record of parseProtoFields(bytes)) {
    if (record.wire !== 2) continue;
    const outer = parseProtoFields(record.value);
    const wrapperBytes = first(outer, 2);
    if (!(wrapperBytes instanceof Uint8Array)) continue;
    const wrapper = parseProtoFields(wrapperBytes);
    const kind = decode(first(wrapper, 5));
    if (kind !== "Definitions.IAPData" && kind !== "Definitions.StoreFrontGroup") continue;
    const payloadBytes = first(wrapper, 6);
    if (!(payloadBytes instanceof Uint8Array)) throw new Error("Missing definition payload.");
    const data = parseProtoFields(payloadBytes);
    definitionCount++;
    if (kind === "Definitions.IAPData") iaps.push(iap(data));
    else groups.push(group(data));
  }
  if (!iaps.length || !groups.length) {
    throw new Error("The file did not expose both IAPData and StoreFrontGroup records.");
  }
  const seen = new Set();
  for (const item of iaps) {
    if (seen.has(item.UniqueName)) throw new Error("Ambiguous duplicate IAP UniqueName.");
    seen.add(item.UniqueName);
  }
  return {
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    IAPCount: iaps.length,
    StoreFrontGroupCount: groups.length,
    parsedRelevantDefinitions: definitionCount,
    IAPData: iaps.sort((a, b) => a.UniqueName.localeCompare(b.UniqueName, "en")),
    StoreFrontGroups: groups.sort((a, b) => a.UniqueName.localeCompare(b.UniqueName, "en"))
  };
}

export function diffProtoDb(before, after) {
  const oldItems = new Map(before.IAPData.map(item => [item.UniqueName, item]));
  const newItems = new Map(after.IAPData.map(item => [item.UniqueName, item]));
  const added = after.IAPData.filter(item => !oldItems.has(item.UniqueName));
  const removed = before.IAPData.filter(item => !newItems.has(item.UniqueName));
  const changed = after.IAPData.filter(item =>
    oldItems.has(item.UniqueName) && JSON.stringify(item) !== JSON.stringify(oldItems.get(item.UniqueName)))
    .map(item => ({ before: oldItems.get(item.UniqueName), after: item }));
  return {
    format: "ddv-iap-protodb-comparison-v1",
    before: { size: before.size, sha256: before.sha256, IAPCount: before.IAPCount,
      StoreFrontGroupCount: before.StoreFrontGroupCount, StoreFrontGroups: before.StoreFrontGroups },
    after: { size: after.size, sha256: after.sha256, IAPCount: after.IAPCount,
      StoreFrontGroupCount: after.StoreFrontGroupCount, StoreFrontGroups: after.StoreFrontGroups },
    addedIAP: added,
    removedIAP: removed,
    changedIAP: changed,
    warnings: [
      "All records are raw IAP observations; this is not automatic DLC identification",
      "Marketplace product presence does not establish stored PackName or storefront entitlement",
      "No console Build ID, profile ownership or in-game behavior is derived from protoDb"
    ]
  };
}

function argumentsForRun(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    if (!["--before", "--after", "--output"].includes(name) ||
        !argv[i + 1] || argv[i + 1].startsWith("--") || parsed[name]) {
      throw new Error("Usage: node tools/inspect-protodb-iap.mjs --after protoDb.bin [--before previous-protoDb.bin] [--output report.json]");
    }
    parsed[name] = argv[i + 1];
  }
  if (!parsed["--after"]) {
    throw new Error("Usage: node tools/inspect-protodb-iap.mjs --after protoDb.bin [--before previous-protoDb.bin] [--output report.json]");
  }
  return parsed;
}

async function main(argv) {
  const args = argumentsForRun(argv);
  const after = inspectProtoDb(await readFile(args["--after"]));
  const report = args["--before"]
    ? diffProtoDb(inspectProtoDb(await readFile(args["--before"])), after)
    : { format: "ddv-iap-protodb-observations-v1", after };
  if (args["--output"]) {
    await writeFile(args["--output"], JSON.stringify(report, null, 2) + "\n",
      { flag: "wx", mode: 0o600 });
    process.stdout.write("IAP evidence report created locally.\n");
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
}
