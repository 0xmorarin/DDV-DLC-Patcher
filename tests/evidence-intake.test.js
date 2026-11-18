import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { encryptProfile } from "../js/profile.js";
import { compareOwnershipEvidence, projectOwnershipEvidence } from "../tools/inspect-ownership-evidence.mjs";

const execute = promisify(execFile);

function profile() {
  return {
    GameInfo: {
      InitialVersion: 518,
      Version: 626,
      ProfileUID: "puid_PRIVATE_PROFILE_IDENTIFIER",
      Revision: 1,
      LastCustomIdOwner: "PRIVATE_ACCOUNT"
    },
    Player: {
      Name: "PRIVATE_PLAYER_NAME",
      ContainerInventories: {},
      CurrencyAmounts: {},
      Cookbook: {}
    },
    World: { Villages: [], Characters: [], GridCollection: {}, QuestInfo: {} },
    LastKnownBoughtExpansionsAnyPlatform: ["Expansion01", "WinnieDLC"],
    ExpansionPackOwnershipByPlatform: {
      Nintendo: {
        Entries: [{
          PackName: "Expansion1PackExpansionPass_Nintendo_OnlineKey",
          PackType: "ExpansionPack",
          Type: "Type_Purchased"
        }, {
          PackName: "PRIVATE_EDITION_ACCOUNT_RECORD",
          PackType: "Other",
          Type: "PRIVATE_CUSTOMER_VALUE"
        }],
        PRIVATE_METADATA: "PRIVATE_SPECIAL"
      },
      Steam: { Entries: [] }
    },
    PRIVATE_PROFILE_FIELD: { token: "PRIVATE_SECRET_TOKEN" }
  };
}

test("ownership projection redacts player details, unknown edition values and all unrelated profile fields", () => {
  const input = profile();
  const original = structuredClone(input);
  const result = projectOwnershipEvidence(input);
  const report = JSON.stringify(result);
  assert.equal(result.GameInfoVersion, 626);
  assert.equal("exceedsVerifiedWriterVersion" in result, false);
  assert.deepEqual(result.anyPlatformIds, ["Expansion01", "WinnieDLC"]);
  assert.deepEqual(Object.keys(result.platforms), ["Nintendo", "Steam"]);
  assert.equal(result.platforms.Nintendo.expansionEntries.length, 1);
  assert.equal(result.platforms.Nintendo.nonExpansionRecordCount, 1);
  assert.equal(result.platforms.Nintendo.expansionEntries[0].occurrences, 1);
  for (const secret of ["PRIVATE_PROFILE_IDENTIFIER", "PRIVATE_ACCOUNT", "PRIVATE_PLAYER_NAME",
    "PRIVATE_CUSTOMER_VALUE", "PRIVATE_EDITION_ACCOUNT_RECORD", "PRIVATE_SPECIAL", "PRIVATE_SECRET_TOKEN"]) {
    assert.equal(report.includes(secret), false, secret);
  }
  assert.deepEqual(input, original);
});

test("two matching profiles show only observed additions and removals, not inferred ownership rights", () => {
  const before = profile();
  const after = structuredClone(before);
  after.GameInfo.Version = 627;
  after.Player.Name = "PRIVATE_OTHER_NAME";
  after.LastKnownBoughtExpansionsAnyPlatform.push("Expansion04");
  after.ExpansionPackOwnershipByPlatform.Nintendo.Entries.push({
    PackName: "KeepsakeExpansionPass_Nintendo_OnlineKey",
    PackType: "ExpansionPack",
    Type: "Type_Purchased"
  });
  const result = compareOwnershipEvidence(before, after);
  assert.deepEqual(result.changes.anyPlatformAdded, ["Expansion04"]);
  assert.deepEqual(result.changes.anyPlatformRemoved, []);
  assert.equal(result.after.GameInfoVersion, 627);
  assert.deepEqual(result.changes.platformChanges.Nintendo.added, [{
    PackName: "KeepsakeExpansionPass_Nintendo_OnlineKey",
    PackType: "ExpansionPack", Type: "Type_Purchased"
  }]);
  assert.deepEqual(result.changes.platformChanges.Steam.added, []);
  assert.equal(result.changes.platformChanges.Nintendo.nonExpansionRecordCountAfter, 1);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_OTHER_NAME"));
});

test("duplicate existing ownership remains visible as an occurrence count, not silently validated", () => {
  const input = profile();
  input.ExpansionPackOwnershipByPlatform.Nintendo.Entries.push(
    structuredClone(input.ExpansionPackOwnershipByPlatform.Nintendo.Entries[0]));
  const projected = projectOwnershipEvidence(input);
  assert.equal(projected.platforms.Nintendo.expansionEntries[0].occurrences, 2);
});

test("mismatching profile identity, invalid map structure, and suspicious IDs fail closed", () => {
  const first = profile();
  const second = structuredClone(first);
  second.GameInfo.ProfileUID = "puid_DIFFERENT";
  assert.throws(() => compareOwnershipEvidence(first, second), /matching identity/);
  first.ExpansionPackOwnershipByPlatform.Nintendo.Entries = "not-an-array";
  assert.throws(() => projectOwnershipEvidence(first), /unsupported entry node/);
  const third = profile();
  third.LastKnownBoughtExpansionsAnyPlatform.push("puid_Private@example.com");
  assert.throws(() => projectOwnershipEvidence(third), /outside the safe evidence format/);
});

test("offline CLI extracts paired encrypted profile evidence and cannot overwrite prior reports", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ddv-evidence-"));
  try {
    const before = profile();
    const after = structuredClone(before);
    after.LastKnownBoughtExpansionsAnyPlatform.push("Expansion02");
    after.ExpansionPackOwnershipByPlatform.Steam.Entries.push({
      PackName: "Expansion2PackExpansionPass_Steam_OnlineKey",
      PackType: "ExpansionPack",
      Type: "Type_Purchased"
    });
    const beforePath = join(dir, "before.json");
    const afterPath = join(dir, "after.json");
    const reportPath = join(dir, "redacted.json");
    await writeFile(beforePath, await encryptProfile(before));
    await writeFile(afterPath, await encryptProfile(after));
    const runner = new URL("../tools/inspect-ownership-evidence.mjs", import.meta.url);
    const args = [runner.pathname, "--before", beforePath, "--after", afterPath, "--output", reportPath];
    const { stdout } = await execute(process.execPath, args, { timeout: 20000 });
    assert.match(stdout, /report created locally/);
    assert.ok(!stdout.includes("PRIVATE_"));
    const reportText = await readFile(reportPath, "utf8");
    const report = JSON.parse(reportText);
    assert.deepEqual(report.changes.anyPlatformAdded, ["Expansion02"]);
    assert.equal(report.changes.platformChanges.Steam.added.length, 1);
    assert.ok(!reportText.includes("PRIVATE_"));
    await assert.rejects(() => execute(process.execPath, args, { timeout: 20000 }), /EEXIST/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
