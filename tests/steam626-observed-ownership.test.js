import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_PATCH_PLATFORMS, DLC_CATALOG, MAX_VERIFIED_PROFILE_VERSION } from "../js/config.js";
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
    ["Expansion01", "Expansion02", "Expansion03", "WinnieDLC"]);
  assert.deepEqual([...AUTO_PATCH_PLATFORMS], ["Nintendo", "Steam"]);
  for (const platform of AUTO_PATCH_PLATFORMS) {
    assert.deepEqual(DLC_CATALOG.map(item => item.entitlements[platform].PackName),
      observedEntitlements[platform]);
    assert.ok(DLC_CATALOG.every(item => item.entitlements[platform].PackType === "ExpansionPack"));
    assert.ok(DLC_CATALOG.every(item => item.entitlements[platform].Type === "Type_Purchased"));
  }
  assert.equal(MAX_VERIFIED_PROFILE_VERSION, 626);
});

test("redacted Steam 626 ownership projection produces no output when both storefronts already contain all four passes", async () => {
  const input = redactedSteam626Projection();
  const encrypted = await encryptProfile(input);
  const result = await patchProfileBytes(encrypted);
  assert.equal(result.status, "already-patched");
  assert.equal(result.inputType, "encrypted");
  assert.equal(result.output, null);
  assert.equal(result.totalAdded, 0);
  assert.equal(result.plan.anyPlatform.length, 0);
  assert.ok(Object.values(result.plan.platforms).every(value => value.additions.length === 0));
});

test("Steam 626 projection adds only a deleted Steam pass and preserves unrelated and edition-like entries", async () => {
  const input = redactedSteam626Projection();
  input.ExpansionPackOwnershipByPlatform.Steam.Entries.pop();
  const before = structuredClone(input);
  const result = await patchProfileBytes(await encryptProfile(input));
  assert.equal(result.status, "patched");
  assert.equal(result.plan.anyPlatform.length, 0);
  assert.equal(result.plan.platforms.Nintendo.additions.length, 0);
  assert.equal(result.plan.platforms.Steam.additions.length, 1);
  const decoded = await decryptGeneratedProfile(result.output);
  assert.deepEqual(decoded.ExpansionPackOwnershipByPlatform.Nintendo,
    before.ExpansionPackOwnershipByPlatform.Nintendo);
  assert.deepEqual(decoded.LastKnownBoughtExpansionsAnyPlatform,
    before.LastKnownBoughtExpansionsAnyPlatform);
  assert.deepEqual(decoded.SyntheticProtectedField, before.SyntheticProtectedField);
  assert.deepEqual(input, before);
  const repeated = await patchProfileBytes(result.output);
  assert.equal(repeated.status, "already-patched");
  assert.equal(repeated.output, null);
});

test("new save versions are rejected until an explicit compatibility review", async () => {
  const input = redactedSteam626Projection();
  input.GameInfo.Version = 627;
  await assert.rejects(() => patchProfileBytes(await encryptProfile(input)),
    /newer than the validated compatibility range/);
});
