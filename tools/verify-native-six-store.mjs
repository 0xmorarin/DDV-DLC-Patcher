import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { AUTO_PATCH_PLATFORMS, DLC_CATALOG } from "../js/config.js";
import { inspectProtoDb } from "./inspect-protodb-iap.mjs";

const originals = Object.freeze({
  elf: ["e99b1aa67ec729053d847adb3621d63e4f2ced570826b8b923531378752b8ebf", 192176944],
  literals: ["07fddfde3c45e1aed88e3f1c0db3721f80e7ddc3407df21f62b6a372ee1bfd1a", 5126747],
  protoDb: ["1912bb552abddac8b112fa5a781a0401672add38a62276d6c9174db39b899ae1", 1164172],
  dump: ["638a5618728e92821ab146d4281e7cc47657785317a065e810a83034c217bf6b", 59628222]
});

const origins = Object.freeze({
  Steam: 1, Sony: 2, Nintendo: 3, Microsoft: 4, Epic: 5, Apple: 6, AppleArcade: 7
});

const productMarketplaces = Object.freeze({
  Steam: ["Steam"],
  Sony: ["PS4_SEIE", "PS4_SEIA", "PS5_SEIE", "PS5_SEIA"],
  Nintendo: ["Nintendo"],
  Microsoft: ["Xbox"],
  Epic: ["Epic"],
  Apple: ["AppleAppStore"]
});

const passes = Object.freeze([
  ["expansion01", "Expansion1PackExpansionPass", "Expansion01"],
  ["expansion02", "Expansion2PackExpansionPass", "Expansion02"],
  ["expansion03", "Expansion3PackExpansionPass", "Expansion03"],
  ["mini-expansion01", "MiniExpansion1PackExpansionPass", "WinnieDLC"]
]);

const instructionWords = Object.freeze([
  [0x03f83434, 0xf9400e73],
  [0x03f83468, 0xf9400d14],
  [0x03f8357c, 0xaa1303e0],
  [0x03f83580, 0xf945f101],
  [0x03f83588, 0xaa1403e2],
  [0x03f8358c, 0xf9461103],
  [0x03f835a0, 0x148b46d8],
  [0x03f64160, 0xf9401100],
  [0x03f643b4, 0x97fffebf],
  [0x03f643e0, 0xf8020d13],
  [0x05a1fd2c, 0xf9400d15],
  [0x05a1fda8, 0xf9405b00],
  [0x05a1fdbc, 0xaa1503e1],
  [0x05a1fdc0, 0x9787d1a0],
  [0x05a1fe90, 0xaa1503e1],
  [0x05a1fe98, 0xaa1603e2],
  [0x05a1fe9c, 0x9787d291],
  [0x05a201ec, 0x97958c89],
  [0x05a2044c, 0x9400aac5],
  [0x05a20450, 0xb9403ae8],
  [0x05a20458, 0xb9002308],
  [0x05a2045c, 0x52800148],
  [0x05a2046c, 0xb879d908],
  [0x05a20470, 0xb9002708]
]);

function requireCondition(condition, message) {
  if (!condition) throw new Error("Static proof mismatch: " + message);
}

function verifiedInput(bytes, name) {
  const [sha, length] = originals[name];
  requireCondition(bytes.length === length, name + " original size");
  requireCondition(createHash("sha256").update(bytes).digest("hex") === sha, name + " original SHA-256");
}

function sectionRanges(elf) {
  requireCondition(elf.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), "ELF magic");
  requireCondition(elf[4] === 2 && elf[5] === 1 && elf.readUInt16LE(18) === 183, "ELF64 LE AArch64 identity");
  const shoff = Number(elf.readBigUInt64LE(40));
  const shentsize = elf.readUInt16LE(58);
  const count = elf.readUInt16LE(60);
  requireCondition(shentsize >= 64 && count > 0 && shoff + shentsize * count <= elf.length,
    "ELF section table bounds");
  const result = [];
  for (let i = 0; i < count; i++) {
    const start = shoff + i * shentsize;
    const type = elf.readUInt32LE(start + 4);
    const addr = Number(elf.readBigUInt64LE(start + 16));
    const offset = Number(elf.readBigUInt64LE(start + 24));
    const size = Number(elf.readBigUInt64LE(start + 32));
    if (type === 1 && size > 0) {
      requireCondition(offset + size <= elf.length, "ELF section byte range");
      result.push({ addr, offset, size });
    }
  }
  return result;
}

function wordAt(elf, ranges, address) {
  const range = ranges.find(item => address >= item.addr && address + 4 <= item.addr + item.size);
  requireCondition(range, "instruction/table RVA 0x" + address.toString(16));
  return elf.readUInt32LE(range.offset + address - range.addr);
}

export function verifySixStoreOriginals({ elf, literals, protoDb, dump }) {
  verifiedInput(elf, "elf");
  verifiedInput(literals, "literals");
  verifiedInput(protoDb, "protoDb");
  verifiedInput(dump, "dump");
  const sections = sectionRanges(elf);
  for (const [address, expected] of instructionWords) {
    requireCondition(wordAt(elf, sections, address) === expected,
      "native opcode at RVA 0x" + address.toString(16));
  }
  requireCondition([0, 10, 1, 2].every((value, i) =>
    wordAt(elf, sections, 0x93a48f0 + i * 4) === value),
  "ApplyExpansionsOwnershipStatus purchase-state lookup table");
  const rawLiterals = JSON.parse(literals.toString("utf8"));
  const literalMap = new Map(rawLiterals.map(item => [Number(item.address), item.value]));
  requireCondition(literalMap.get(0xb287be0) === "_", "UniqueName separator literal");
  requireCondition(literalMap.get(0xb288c20) === "_OnlineKey", "ownership suffix literal");
  const il2cpp = dump.toString("utf8");
  for (const needle of [
    "ExpansionPackOwnershipByPlatformFieldNumber = 102",
    "MapField<string, ExpansionPackOwnershipSet> ExpansionPackOwnershipByPlatform",
    "public const IAPType ExpansionPack = 2",
    "public const ExpansionPackOwnership.Types.OwnershipType TypePurchased = 0"
  ]) {
    requireCondition(il2cpp.includes(needle), "IL2CPP metadata: " + needle);
  }
  const database = inspectProtoDb(protoDb);
  requireCondition(database.IAPCount === 49, "IAP count");
  requireCondition(database.StoreFrontGroupCount === 7, "storefront-group count");
  for (const [group, origin] of Object.entries(origins)) {
    const record = database.StoreFrontGroups.find(item => item.UniqueName === group);
    requireCondition(record && record.OriginIds.length === 1 &&
      record.OriginIds[0] === origin, "StoreFrontGroup OriginIds for " + group);
  }
  requireCondition(AUTO_PATCH_PLATFORMS.length === 6 &&
    AUTO_PATCH_PLATFORMS.every(group => group in origins && group !== "AppleArcade"),
  "production six-store writer allowlist");
  const keys = {};
  for (const [id, iapName, anyPlatformId] of passes) {
    const record = database.IAPData.find(item => item.UniqueName === iapName);
    requireCondition(record && record.Type === 2, "IAPData ExpansionPack Type for " + id);
    const catalog = DLC_CATALOG.find(item => item.id === id);
    requireCondition(catalog && catalog.anyPlatformId === anyPlatformId,
      "existing DLC ID for " + id);
    keys[id] = {};
    for (const group of AUTO_PATCH_PLATFORMS) {
      const markets = group === "Epic"
        ? record.CustomStoreFrontProductMarkets : record.StoreFrontProductMarkets;
      requireCondition(productMarketplaces[group].some(market => markets.includes(market)),
        "actual " + group + " IAP storefront product for " + id);
      const expected = iapName + "_" + group + "_OnlineKey";
      const entitlement = catalog.entitlements[group];
      requireCondition(entitlement?.PackName === expected &&
        entitlement.PackType === "ExpansionPack" && entitlement.Type === "Type_Purchased",
        "production entitlement for " + id + "/" + group);
      keys[id][group] = expected;
    }
    requireCondition(!catalog.entitlements.AppleArcade, "AppleArcade exclusion for " + id);
  }
  requireCondition(DLC_CATALOG.length === passes.length,
    "unexpected unsupported new DLC in v1.25.3 proof");
  return {
    result: "PASS",
    target: "Switch v1.25.3 main.elf BID 9A239D3DB569756D",
    checkedInstructionWords: instructionWords.length,
    validatedLiterals: 2,
    validatedStorefronts: origins,
    verifiedIAPs: passes.length,
    verifiedEntitlementDefinitions: Object.keys(keys).length * AUTO_PATCH_PLATFORMS.length,
    ownershipType: "Type_Purchased",
    evidence: "Native AArch64 + original protobuf + IL2CPP + observed original Steam ownership records",
    notProven: "Four other native client binaries, platform-specific offline game reload, service ownership and synchronization"
  };
}

async function main(args) {
  const paths = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!["--elf", "--literals", "--protodb", "--dump"].includes(key) ||
        !args[i + 1] || paths[key]) {
      throw new Error("Usage: node tools/verify-native-six-store.mjs --elf main.elf --literals stringliteral.json --protodb protoDb.bin --dump dump.cs");
    }
    paths[key] = args[i + 1];
  }
  requireCondition(Object.keys(paths).length === 4, "four private original inputs required");
  const [elf, literals, protoDb, dump] = await Promise.all([
    readFile(paths["--elf"]), readFile(paths["--literals"]),
    readFile(paths["--protodb"]), readFile(paths["--dump"])
  ]);
  process.stdout.write(JSON.stringify(verifySixStoreOriginals({ elf, literals, protoDb, dump }),
    null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
}
