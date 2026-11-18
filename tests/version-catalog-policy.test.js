import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_PATCH_PLATFORMS, DLC_CATALOG, MIN_SUPPORTED_PROFILE_VERSION, FIVE_DLC_MIN_PROFILE_VERSION, catalogForProfileVersion } from "../js/config.js";
import { patchProfileBytes } from "../js/auto-patch.js";
import { encryptProfile, decryptGeneratedProfile } from "../js/profile.js";

function fixture(version) {
  return {
    GameInfo: { InitialVersion: 518, Version: version, ProfileUID: "puid_version_boundary_fixture", Revision: 1 },
    Player: { Name: "Synthetic", ContainerInventories: {}, CurrencyAmounts: {}, Cookbook: {} },
    World: { Villages: [], Characters: [], GridCollection: {}, QuestInfo: {} },
    LastKnownBoughtExpansionsAnyPlatform: ["UnknownOriginal"],
    ExpansionPackOwnershipByPlatform: {
      Nintendo: {
        Entries: [{
          PackName: "Other_PremiumEdition",
          PackType: "Other",
          Type: "Original"
        }],
        Metadata: { keep: "this" }
      },
      AppleArcade: { Entries: [{ PackName: "OriginalArcade", PackType: "Other", Type: "Original" }] }
    },
    UnknownOriginal: { nested: [1, true, "unchanged"] }
  };
}

function bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

test("catalog selection restores v1.24.1 minimum, four historic passes and v1.26.1 fifth pass", () => {
  assert.equal(MIN_SUPPORTED_PROFILE_VERSION, 591);
  assert.equal(FIVE_DLC_MIN_PROFILE_VERSION, 643);
  assert.equal(DLC_CATALOG.length, 5);
  for (const version of [591, 592, 626, 627, 642]) {
    const selected = catalogForProfileVersion(version);
    assert.deepEqual(selected.map(item => item.anyPlatformId),
      ["Expansion01", "Expansion02", "Expansion03", "WinnieDLC"]);
    assert.equal(selected.some(item => item.anyPlatformId === "Expansion04"), false);
  }
  for (const version of [643, 644, 750]) {
    const selected = catalogForProfileVersion(version);
    assert.deepEqual(selected.map(item => item.anyPlatformId),
      ["Expansion01", "Expansion02", "Expansion03", "WinnieDLC", "Expansion04"]);
  }
});

test("profile below 591 is rejected regardless of matching ownership structure", async () => {
  for (const version of [0, 518, 590]) {
    await assert.rejects(() => patchProfileBytes(bytes(fixture(version))), /predates DDV v1\.24\.1/);
  }
});

test("legacy profile at 591 and 626 receives only four pass markers per six groups", async () => {
  for (const version of [591, 626]) {
    const before = fixture(version);
    const patched = await patchProfileBytes(bytes(before));
    assert.equal(patched.status, "patched");
    assert.equal(patched.version, version);
    assert.equal(patched.catalog.length, 4);
    assert.equal(patched.plan.anyPlatform.length, 4);
    assert.equal(patched.totalAdded, 28);
    const after = await decryptGeneratedProfile(patched.output);
    assert.equal(after.GameInfo.Version, version);
    assert.equal(after.LastKnownBoughtExpansionsAnyPlatform.includes("Expansion04"), false);
    for (const platform of AUTO_PATCH_PLATFORMS) {
      assert.equal(patched.plan.platforms[platform].additions.length, 4);
      assert.ok(after.ExpansionPackOwnershipByPlatform[platform].Entries.every(
        entry => !entry.PackName.startsWith("Expansion4PackExpansionPass_")));
    }
    assert.deepEqual(after.ExpansionPackOwnershipByPlatform.AppleArcade,
      before.ExpansionPackOwnershipByPlatform.AppleArcade);
    assert.deepEqual(after.UnknownOriginal, before.UnknownOriginal);
    const repeated = await patchProfileBytes(patched.output);
    assert.equal(repeated.status, "already-patched");
    assert.equal(repeated.output, null);
    assert.equal(repeated.catalog.length, 4);
  }
});

test("legacy save remains four-pass at 642; a newer save at 643 adds the fifth pass", async () => {
  const original = fixture(642);
  const oldPatch = await patchProfileBytes(bytes(original));
  assert.equal(oldPatch.catalog.length, 4);
  const upgraded = await decryptGeneratedProfile(oldPatch.output);
  const existingBefore = structuredClone(upgraded.ExpansionPackOwnershipByPlatform);
  upgraded.GameInfo.Version = 643;
  const newPatch = await patchProfileBytes(await encryptProfile(upgraded));
  assert.equal(newPatch.catalog.length, 5);
  assert.equal(newPatch.totalAdded, 7);
  assert.equal(newPatch.plan.anyPlatform.length, 1);
  assert.ok(AUTO_PATCH_PLATFORMS.every(platform =>
    newPatch.plan.platforms[platform].additions.length === 1));
  const after = await decryptGeneratedProfile(newPatch.output);
  assert.equal(after.LastKnownBoughtExpansionsAnyPlatform.at(-1), "Expansion04");
  for (const platform of AUTO_PATCH_PLATFORMS) {
    assert.deepEqual(after.ExpansionPackOwnershipByPlatform[platform].Entries.slice(0, 4),
      existingBefore[platform].Entries.slice(0, 4));
  }
  assert.equal((await patchProfileBytes(newPatch.output)).status, "already-patched");
});

test("old profile pre-populated with new IDs never has existing records removed or rewritten", async () => {
  const before = fixture(626);
  before.LastKnownBoughtExpansionsAnyPlatform.push("Expansion04");
  before.ExpansionPackOwnershipByPlatform.Nintendo.Entries.push({
    PackName: "Expansion4PackExpansionPass_Nintendo_OnlineKey",
    PackType: "Other",
    Type: "PreserveUnusualOriginal",
    PrivateUnknown: { preserve: true }
  });
  const result = await patchProfileBytes(bytes(before));
  assert.equal(result.catalog.length, 4);
  const after = await decryptGeneratedProfile(result.output);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Nintendo.Entries[1],
    before.ExpansionPackOwnershipByPlatform.Nintendo.Entries[1]);
  assert.deepEqual(after.LastKnownBoughtExpansionsAnyPlatform.slice(0, 2),
    before.LastKnownBoughtExpansionsAnyPlatform);
  assert.equal(after.ExpansionPackOwnershipByPlatform.Steam.Entries.some(
    e => e.PackName === "Expansion4PackExpansionPass_Steam_OnlineKey"), false);
});

test("future schema-compatible profile still selects five DLCs without an upper version ceiling", async () => {
  const input = fixture(1200);
  const result = await patchProfileBytes(bytes(input));
  assert.equal(result.catalog.length, 5);
  assert.equal(result.version, 1200);
  assert.equal(result.plan.anyPlatform.length, 5);
  assert.equal(result.totalAdded, 35);
});
