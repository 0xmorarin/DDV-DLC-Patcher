import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile } from "../js/profile.js";
import { MAX_VERIFIED_PROFILE_VERSION, STANDARD_STOREFRONT_GROUPS } from "../js/config.js";

const safeIdentifier = /^[A-Za-z][A-Za-z0-9_]{0,95}$/;
const safeStorefront = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const safePackName = /^[A-Za-z][A-Za-z0-9]{0,127}_[A-Za-z][A-Za-z0-9]{0,31}_OnlineKey$/;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkedIdentifier(value, pattern, category) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error("A " + category + " value is outside the safe evidence format. No report was produced.");
  }
  return value;
}

function serializeEntry(entry) {
  if (!object(entry) || entry.PackType !== "ExpansionPack" ||
      typeof entry.PackName !== "string" || !safePackName.test(entry.PackName)) return null;
  const packType = checkedIdentifier(entry.PackType, safeIdentifier, "pack type");
  const type = checkedIdentifier(entry.Type, safeIdentifier, "entitlement type");
  return { PackName: entry.PackName, PackType: packType, Type: type };
}

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b, "en"));
}

function uniqueEntries(entries) {
  const byValue = new Map();
  for (const entry of entries) {
    const key = JSON.stringify(entry);
    byValue.set(key, (byValue.get(key) ?? 0) + 1);
  }
  return [...byValue].sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([key, count]) => ({ ...JSON.parse(key), occurrences: count }));
}

export function projectOwnershipEvidence(profile) {
  if (!object(profile) || !object(profile.GameInfo) ||
      !Number.isInteger(profile.GameInfo.Version) ||
      !Array.isArray(profile.LastKnownBoughtExpansionsAnyPlatform)) {
    throw new Error("The profile does not have the required evidence fields.");
  }
  const anyPlatformIds = profile.LastKnownBoughtExpansionsAnyPlatform.map(value =>
    checkedIdentifier(value, safeIdentifier, "any-platform expansion ID"));
  const owned = profile.ExpansionPackOwnershipByPlatform;
  if (owned !== undefined && !object(owned)) {
    throw new Error("Ownership platform map has an unsupported structure.");
  }
  const platforms = {};
  for (const key of sortStrings(Object.keys(owned ?? {}))) {
    checkedIdentifier(key, safeStorefront, "storefront map key");
    const node = owned[key];
    if (!object(node) || !Array.isArray(node.Entries)) {
      throw new Error("Ownership platform map contains an unsupported entry node.");
    }
    const visible = [];
    let nonExpansionRecordCount = 0;
    let additionalFieldRecordCount = 0;
    for (const entry of node.Entries) {
      const canonical = serializeEntry(entry);
      if (canonical) visible.push(canonical);
      else nonExpansionRecordCount++;
      if (object(entry) && Object.keys(entry).some(k => !["PackName", "PackType", "Type"].includes(k))) {
        additionalFieldRecordCount++;
      }
    }
    platforms[key] = {
      recognizedStandardGroup: STANDARD_STOREFRONT_GROUPS.includes(key),
      expansionEntries: uniqueEntries(visible),
      nonExpansionRecordCount,
      additionalFieldRecordCount
    };
  }
  return {
    GameInfoVersion: profile.GameInfo.Version,
    GameInfoInitialVersion: Number.isInteger(profile.GameInfo.InitialVersion)
      ? profile.GameInfo.InitialVersion : null,
    exceedsVerifiedWriterVersion: profile.GameInfo.Version > MAX_VERIFIED_PROFILE_VERSION,
    anyPlatformIds: sortStrings(anyPlatformIds),
    platforms
  };
}

function signature(entry) {
  return JSON.stringify([entry.PackName, entry.PackType, entry.Type]);
}

function expandedSignatures(entries) {
  return entries.flatMap(entry => Array.from({ length: entry.occurrences },
    () => signature(entry)));
}

function subtractOccurrences(left, right) {
  const counts = new Map();
  for (const entry of right) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  return left.filter(entry => {
    const count = counts.get(entry) ?? 0;
    if (count === 0) return true;
    counts.set(entry, count - 1);
    return false;
  });
}

function diffEntries(before, after) {
  const original = expandedSignatures(before);
  const updated = expandedSignatures(after);
  return {
    added: subtractOccurrences(updated, original).map(value => {
      const [PackName, PackType, Type] = JSON.parse(value);
      return { PackName, PackType, Type };
    }),
    removed: subtractOccurrences(original, updated).map(value => {
      const [PackName, PackType, Type] = JSON.parse(value);
      return { PackName, PackType, Type };
    })
  };
}

export function compareOwnershipEvidence(before, after) {
  if (before.GameInfo?.ProfileUID !== after.GameInfo?.ProfileUID) {
    throw new Error("The two profile snapshots do not have a matching identity. No report was produced.");
  }
  const a = projectOwnershipEvidence(before);
  const b = projectOwnershipEvidence(after);
  const platformChanges = {};
  const keys = sortStrings(new Set([...Object.keys(a.platforms), ...Object.keys(b.platforms)]));
  for (const key of keys) {
    const original = a.platforms[key] ?? { expansionEntries: [], nonExpansionRecordCount: 0 };
    const updated = b.platforms[key] ?? { expansionEntries: [], nonExpansionRecordCount: 0 };
    const changes = diffEntries(original.expansionEntries, updated.expansionEntries);
    platformChanges[key] = {
      ...changes,
      existedBefore: Object.hasOwn(a.platforms, key),
      existsAfter: Object.hasOwn(b.platforms, key),
      nonExpansionRecordCountBefore: original.nonExpansionRecordCount,
      nonExpansionRecordCountAfter: updated.nonExpansionRecordCount
    };
  }
  return {
    format: "ddv-dlc-ownership-evidence-v1",
    scope: "local-profile-ownership-observations-only",
    before: a,
    after: b,
    changes: {
      anyPlatformAdded: subtractOccurrences(b.anyPlatformIds, a.anyPlatformIds),
      anyPlatformRemoved: subtractOccurrences(a.anyPlatformIds, b.anyPlatformIds),
      platformChanges
    },
    constraints: [
      "Does not establish storefront purchases or game recognition",
      "Does not prove platform key construction or compatibility",
      "No non-ownership fields, player names or account identifiers are exported",
      "Non-expansion ownership records are counted, not revealed",
      "Any unrecognized ownership record format requires manual review"
    ]
  };
}

function argumentsForRun(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 2) {
    const option = argv[i];
    if (!["--before", "--after", "--output"].includes(option) ||
        !argv[i + 1] || argv[i + 1].startsWith("--") || parsed[option]) {
      throw new Error("Usage: node tools/inspect-ownership-evidence.mjs --after SAVE [--before SAVE] [--output REPORT.json]");
    }
    parsed[option] = argv[i + 1];
  }
  if (!parsed["--after"]) {
    throw new Error("Usage: node tools/inspect-ownership-evidence.mjs --after SAVE [--before SAVE] [--output REPORT.json]");
  }
  return parsed;
}

async function main(argv) {
  const args = argumentsForRun(argv);
  const after = (await loadProfile(new Uint8Array(await readFile(args["--after"])))).profile;
  const before = args["--before"]
    ? (await loadProfile(new Uint8Array(await readFile(args["--before"])))).profile
    : null;
  const report = before
    ? compareOwnershipEvidence(before, after)
    : {
      format: "ddv-dlc-ownership-evidence-v1",
      scope: "local-profile-ownership-observations-only",
      after: projectOwnershipEvidence(after),
      constraints: [
        "Single snapshot is not a before-and-after ownership proof",
        "No non-ownership fields, player names or account identifiers are exported",
        "Does not prove storefront purchases, in-game recognition or platform compatibility"
      ]
    };
  const json = JSON.stringify(report, null, 2) + "\n";
  if (args["--output"]) {
    await writeFile(args["--output"], json, { flag: "wx", mode: 0o600 });
    process.stdout.write("Ownership-only evidence report created locally.\n");
  } else {
    process.stdout.write(json);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
}
