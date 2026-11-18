import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_PATCH_PLATFORMS, DLC_CATALOG } from "../js/config.js";
import { patchProfileBytes } from "../js/auto-patch.js";
import { decryptGeneratedProfile, encryptProfile } from "../js/profile.js";

const observedEntitlements = {
  Nintendo: [
    "Expansion1PackExpansionPass_Nintendo_OnlineKey",
    "Expansion2PackExpansionPass_Nintendo_OnlineKey",
    "Expansion3PackExpansionPass_Nintendo_OnlineKey",
    "MiniExpansion1PackExpansionPass_Nintendo_OnlineKey"
  ],
  Steam: [
    "Expansion1PackExpansionPass_Steam_OnlineKey",
    "Expansion2PackExpansionPass_Steam_OnlineKey",
    "Expansion3PackExpansionPass_Steam_OnlineKey",
    "MiniExpansion1PackExpansionPass_Steam_OnlineKey"
  ]
};

function redactedSteam626Projection() {
  return {
    GameInfo: { InitialVersion: 518, Version: 626, ProfileUID: "puid_synthetic_projection", Revision: 1 },
    Player: { ContainerInventories: {}, CurrencyAmounts: {}, Cookbook: {} },
    World: { Villages: [], Characters: [], GridCollection: {}, QuestInfo: {} },
    LastKnownBoughtExpansionsAnyPlatform: [
      "SyntheticUnknownExpansion", "Expansion01", "Expansion02", "Expansion03", "WinnieDLC"
    ],
    ExpansionPackOwnershipByPlatform: {
      Nintendo: {
        Entries: observedEntitlements.Nintendo.map(PackName => ({
          PackName, PackType: "ExpansionPack", Type: "Type_Purchased"
        })).concat([{ PackName: "SyntheticOtherEntitlement", PackType: "Other", Type: "Preserve" }])
      },
      Steam: {
        Entries: observedEntitlements.Steam.map(PackName => ({
          PackName, PackType: "ExpansionPack", Type: "Type_Purchased"
        }))
      }
    },
    SyntheticProtectedField: { mustStay: true }
  };
}

test("v1.25.3 Steam 626 observed expansion identifiers match production catalog for both storefronts", () => {
  assert.deepEqual(DLC_CATALOG.map(item => item.anyPlatformId),
    ["Expansion01", "Expansion02", "Expansion03", "WinnieDLC", "Expansion04"]);
  assert.deepEqual([...AUTO_PATCH_PLATFORMS], ["Nintendo", "Steam", "Epic", "Microsoft", "Sony", "Apple"]);
  for (const platform of Object.keys(observedEntitlements)) {
    assert.deepEqual(DLC_CATALOG.slice(0, 4).map(item => item.entitlements[platform].PackName),
      observedEntitlements[platform]);
    assert.ok(DLC_CATALOG.every(item => item.entitlements[platform].PackType === "ExpansionPack"));
    assert.ok(DLC_CATALOG.every(item => item.entitlements[platform].Type === "Type_Purchased"));
  }
  assert.equal(DLC_CATALOG[4].entitlements.Nintendo.PackName, "Expansion4PackExpansionPass_Nintendo_OnlineKey");
});

test("redacted Steam 626 projection retains observed original records and adds the other four store groups", async () => {
  const input = redactedSteam626Projection();
  const encrypted = await encryptProfile(input);
  const result = await patchProfileBytes(encrypted);
  assert.equal(result.status, "patched");
  assert.equal(result.inputType, "encrypted");
  assert.equal(result.plan.anyPlatform.length, 1);
  assert.equal(result.plan.platforms.Nintendo.additions.length, 1);
  assert.equal(result.plan.platforms.Steam.additions.length, 1);
  for (const platform of ["Epic", "Microsoft", "Sony", "Apple"]) {
    assert.equal(result.plan.platforms[platform].createNode, true);
    assert.equal(result.plan.platforms[platform].additions.length, 5);
  }
  assert.equal(result.totalAdded, 23);
  const decoded = await decryptGeneratedProfile(result.output);
  for (const platform of ["Nintendo", "Steam"]) {
    assert.deepEqual(decoded.ExpansionPackOwnershipByPlatform[platform].Entries.slice(0, observedEntitlements[platform].length),
      input.ExpansionPackOwnershipByPlatform[platform].Entries.slice(0, observedEntitlements[platform].length));
  }
  assert.deepEqual(decoded.LastKnownBoughtExpansionsAnyPlatform.slice(0, -1),
    input.LastKnownBoughtExpansionsAnyPlatform);
  assert.equal(decoded.LastKnownBoughtExpansionsAnyPlatform.at(-1), "Expansion04");
  const repeat = await patchProfileBytes(result.output);
  assert.equal(repeat.status, "already-patched");
  assert.equal(repeat.output, null);
  const legacyOnly = await patchProfileBytes(encrypted, ["Nintendo", "Steam"]);
  assert.equal(legacyOnly.status, "patched");
  assert.equal(legacyOnly.plan.platforms.Nintendo.additions.length, 1);
  assert.equal(legacyOnly.plan.platforms.Steam.additions.length, 1);
});

test("Steam 626 projection adds missing Steam pass and new storefront groups without changing old entries", async () => {
  const input = redactedSteam626Projection();
  input.ExpansionPackOwnershipByPlatform.Steam.Entries.pop();
  const before = structuredClone(input);
  const result = await patchProfileBytes(await encryptProfile(input));
  assert.equal(result.status, "patched");
  assert.equal(result.plan.anyPlatform.length, 1);
  assert.equal(result.plan.platforms.Nintendo.additions.length, 0);
  assert.equal(result.plan.platforms.Steam.additions.length, 2);
  assert.equal(result.totalAdded, 24);
  for (const platform of ["Epic", "Microsoft", "Sony", "Apple"]) {
    assert.equal(result.plan.platforms[platform].additions.length, 4);
  }
  const decoded = await decryptGeneratedProfile(result.output);
  assert.deepEqual(decoded.ExpansionPackOwnershipByPlatform.Nintendo.Entries.slice(0, 4),
    before.ExpansionPackOwnershipByPlatform.Nintendo.Entries.slice(0, 4));
  assert.deepEqual(decoded.LastKnownBoughtExpansionsAnyPlatform.slice(0, -1),
    before.LastKnownBoughtExpansionsAnyPlatform);
  assert.deepEqual(decoded.SyntheticProtectedField, before.SyntheticProtectedField);
  assert.deepEqual(input, before);
  const repeated = await patchProfileBytes(result.output);
  assert.equal(repeated.status, "already-patched");
  assert.equal(repeated.output, null);
});

test("new save versions with unchanged required ownership structure are accepted", async () => {
  const input = redactedSteam626Projection();
  input.GameInfo.Version = 627;
  const encrypted = await encryptProfile(input);
  const result = await patchProfileBytes(encrypted);
  assert.equal(result.version, 627);
  assert.equal(result.status, "patched");
});
