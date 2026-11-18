import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DLC_CATALOG, STANDARD_STOREFRONT_GROUPS } from "../js/config.js";
import { inspectProtoDb } from "./inspect-protodb-iap.mjs";

const originals = Object.freeze({
  nso: ["3e127d189106162c939f3afbaa4d7de12cd0e15277c9b2e7a4a912faed0d67ba", 99766816],
  text: ["04734882051d695da2589fb905370a5989f8af6f3e78c6e93b776a5f49243dbd", 162397040],
  rodata: ["42d74f610541529ddf4976cd6a8a730d2ddfd7e74deebe8c1214ed9ea4f62307", 27137116],
  literals: ["a4b1f3617d075fb7ac5f5de29c6d5ba175a2618ff284ffb91fa475635cb2a023", 6790439],
  protoDb: ["dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623", 1335720],
  dump: ["c2b5eac582b8459cdac9b325b8f3c986371e112f996f8cfb3d2fcb014c5a2107", 62282691]
});

const originalPasses = Object.freeze([
  ["expansion01", "Expansion01", "Expansion1PackExpansionPass"],
  ["expansion02", "Expansion02", "Expansion2PackExpansionPass"],
  ["expansion03", "Expansion03", "Expansion3PackExpansionPass"],
  ["mini-expansion01", "WinnieDLC", "MiniExpansion1PackExpansionPass"]
]);

const newPass = Object.freeze(["Expansion04", "Expansion4PackExpansionPass"]);

const originIds = Object.freeze({
  Steam: 1, Sony: 2, Nintendo: 3, Microsoft: 4, Epic: 5, Apple: 6, AppleArcade: 7
});

const marketplaceIds = Object.freeze({
  Nintendo: ["Nintendo"],
  Steam: ["Steam"],
  Epic: ["Epic"],
  Microsoft: ["Xbox"],
  Sony: ["PS4_SEIE", "PS4_SEIA", "PS5_SEIE", "PS5_SEIA"],
  Apple: ["AppleAppStore"]
});

const originalInstructions = Object.freeze([
  [0x040baa24, 0x97fffebf],
  [0x040baa50, 0xf8020d13],
  [0x040ba7d0, 0xf9401100],
  [0x040de684, 0xf9400e73],
  [0x040de6b8, 0xf9400d14],
  [0x040de7d0, 0xf9409d01],
  [0x040de7dc, 0xf940c903],
  [0x040de7f0, 0x14907f7c],
  [0x05d1b84c, 0xf9400d15],
  [0x05d1b8c8, 0xf9405b00],
  [0x05d1b8dc, 0xaa1503e1],
  [0x05d1b8e0, 0x977fc178],
  [0x05d1b9b0, 0xaa1503e1],
  [0x05d1b9b8, 0xaa1603e2],
  [0x05d1b9bc, 0x977fc269],
  [0x05d1bd0c, 0x978f0a55],
  [0x05d1bf6c, 0x94012015],
  [0x05d1bf78, 0xb9002308],
  [0x05d1bf90, 0xb9002708],
  [0x05d1c540, 0x978f0848],
  [0x05d1c550, 0x94011e9c]
]);

function ensure(value, reason) {
  if (!value) throw new Error("v1.26.1 static proof failed: " + reason);
}

function verifyBytes(value, name) {
  const [expectedHash, expectedSize] = originals[name];
  ensure(value.length === expectedSize, name + " byte length");
  ensure(createHash("sha256").update(value).digest("hex") === expectedHash,
    name + " SHA-256");
}

function packDefinition(iap, group) {
  const markets = group === "Epic"
    ? iap.CustomStoreFrontProductMarkets
    : iap.StoreFrontProductMarkets;
  return marketplaceIds[group].some(market => markets.includes(market));
}

export function verifyNewSixStoreOriginals({ nso, text, rodata, literals, protoDb, dump, profile }) {
  for (const [name, value] of Object.entries({ nso, text, rodata, literals, protoDb, dump })) {
    ensure(value instanceof Uint8Array, name + " input bytes");
    verifyBytes(value, name);
  }
  ensure(nso.subarray(0, 4).toString() === "NSO0", "NSO0 signature");
  ensure(Buffer.from(nso.subarray(0x40, 0x50)).toString("hex").toUpperCase() ===
    "3346726B2F640E01EF664D98EB2CF5A0", "full NSO Build ID");
  ensure(nso.readUInt32LE(0x1c) === 0x100 &&
    nso.readUInt32LE(0x18) === text.length, "NSO decompressed text segment geometry");
  for (const [addr, word] of originalInstructions) {
    ensure(text.readUInt32LE(addr) === word,
      "AArch64 word at RVA " + addr.toString(16));
  }
  const statusTable = [0, 10, 1, 2];
  const rodataAddress = 0x09cc2b90;
  const rodataMemoryRva = nso.readUInt32LE(0x24);
  const rodataStart = rodataAddress - rodataMemoryRva;
  ensure(rodataStart >= 0 && rodataStart + 16 <= rodata.length,
    "ownership type lookup rodata offset");
  ensure(statusTable.every((value, index) =>
    rodata.readUInt32LE(rodataStart + index * 4) === value),
    "original purchased-type lookup values");
  const literalMap = new Map(JSON.parse(literals.toString("utf8"))
    .map(item => [Number(item.address), item.value]));
  ensure(literalMap.get(0xbcb9138) === "_", "native separator literal");
  ensure(literalMap.get(0xbcba190) === "_OnlineKey", "native suffix literal");
  const il2cpp = dump.toString("utf8");
  for (const marker of [
    "RVA: 0x40DE660",
    "RVA: 0x40BA9F0",
    "RVA: 0x5D1B380",
    "RVA: 0x5D63FC0",
    "ExpansionPackOwnershipByPlatformFieldNumber = 102",
    "MapField<string, ExpansionPackOwnershipSet>",
    "public const IAPType ExpansionPack = 2",
    "TypePurchased = 0"
  ]) {
    ensure(il2cpp.includes(marker), "original metadata marker " + marker);
  }
  const observed = inspectProtoDb(protoDb);
  ensure(observed.IAPCount === 53, "new IAP definition count");
  ensure(observed.StoreFrontGroupCount === 7, "new group definition count");
  for (const [group, origin] of Object.entries(originIds)) {
    const record = observed.StoreFrontGroups.find(entry => entry.UniqueName === group);
    ensure(record && record.OriginIds.length === 1 && record.OriginIds[0] === origin,
      "new StoreFrontGroup origin " + group);
  }
  ensure(STANDARD_STOREFRONT_GROUPS.length === 6 &&
    STANDARD_STOREFRONT_GROUPS.every(group => group in marketplaceIds),
    "six standard storefront registry");
  for (const [id, expansion, uniqueName] of originalPasses) {
    const catalog = DLC_CATALOG.find(item => item.id === id);
    const iap = observed.IAPData.find(item => item.UniqueName === uniqueName);
    ensure(catalog?.anyPlatformId === expansion && iap?.Type === 2,
      "original expansion ID and IAP type: " + id);
    for (const group of STANDARD_STOREFRONT_GROUPS) {
      ensure(packDefinition(iap, group), "old IAP product coverage " + id + "/" + group);
      const expected = uniqueName + "_" + group + "_OnlineKey";
      const entitlement = catalog.entitlements[group];
      ensure(entitlement?.PackName === expected && entitlement.PackType === "ExpansionPack" &&
        entitlement.Type === "Type_Purchased", "existing six-store writer " + id + "/" + group);
    }
    ensure(!catalog.entitlements.AppleArcade, "AppleArcade excluded " + id);
  }
  const fifth = observed.IAPData.find(item => item.UniqueName === newPass[1]);
  const edition = observed.IAPData.find(item =>
    item.UniqueName === "Expansion4PackDeluxeEdition");
  ensure(fifth?.Type === 2, "fifth expansion-pass native IAP type");
  ensure(edition?.AssociatedExpansion === newPass[0],
    "new expansion family association through actual deluxe IAP");
  for (const group of STANDARD_STOREFRONT_GROUPS) {
    ensure(packDefinition(fifth, group), "fifth pass marketplace " + group);
  }
  let saveObservation = "not-provided";
  if (profile !== undefined) {
    const obj = JSON.parse(profile.toString("utf8"));
    ensure(obj?.GameInfo?.Version === 643 &&
      obj?.GameInfo?.InitialVersion === 518,
      "observed post-release profile version");
    ensure(obj.LastKnownBoughtExpansionsAnyPlatform?.includes(newPass[0]),
      "fifth any-platform saved ID");
    const records = obj?.ExpansionPackOwnershipByPlatform?.Nintendo?.Entries;
    ensure(Array.isArray(records), "Nintendo ownership entries");
    ensure(records.some(entry =>
      entry.PackName === newPass[1] + "_Nintendo_OnlineKey" &&
      entry.PackType === "ExpansionPack" && entry.Type === "Type_Purchased"),
      "fifth saved PackName and entitlement fields");
    saveObservation = "new Nintendo saved Expansion04 and Expansion4PackExpansionPass confirmed";
  }
  return {
    result: "STATIC_PASS",
    version: "v1.26.1",
    buildId: "3346726B2F640E01",
    fileProof: "source SHA-256 matched all six original inputs",
    instructionChecks: originalInstructions.length,
    literalChecks: 2,
    protoDbIAPCount: observed.IAPCount,
    storeGroups: [...STANDARD_STOREFRONT_GROUPS],
    oldDlcSixStoreDefinitions: originalPasses.length * STANDARD_STOREFRONT_GROUPS.length,
    fifthDlc: {
      anyPlatformId: newPass[0],
      passIapUniqueName: newPass[1],
      marketplaceCoverage: [...STANDARD_STOREFRONT_GROUPS],
      note: "Pass IAP itself has an empty AssociatedExpansion field; association derives from expansion family and actual edition IAP plus optional real save."
    },
    saveObservation,
    unverified: [
      "Independent Epic/Microsoft/Sony/Apple native executable binaries",
      "Offline DLC recognition and game reload outside owned Switch/Steam devices",
      "Cloud synchronization and storefront purchase entitlements"
    ]
  };
}

async function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!["--nso", "--text", "--rodata", "--literals", "--protodb", "--dump", "--profile"].includes(key) ||
        !argv[i + 1] || args[key]) {
      throw new Error("Usage: node tools/verify-native-six-store-v1261.mjs --nso main --text decompressed-text.bin --rodata decompressed-rodata.bin --literals stringliteral.json --protodb protoDb.bin --dump dump.cs [--profile redacted-source.profile]");
    }
    args[key] = argv[i + 1];
  }
  for (const key of ["--nso", "--text", "--rodata", "--literals", "--protodb", "--dump"]) {
    ensure(args[key], "missing " + key);
  }
  const names = ["--nso", "--text", "--rodata", "--literals", "--protodb", "--dump"];
  const originals = await Promise.all(names.map(name => readFile(args[name])));
  const profile = args["--profile"] ? await readFile(args["--profile"]) : undefined;
  process.stdout.write(JSON.stringify(verifyNewSixStoreOriginals({
    nso: originals[0], text: originals[1], rodata: originals[2],
    literals: originals[3], protoDb: originals[4], dump: originals[5], profile
  }), null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
}
