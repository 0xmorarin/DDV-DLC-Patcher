import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_PATCH_PLATFORMS, DLC_CATALOG,
  STANDARD_STOREFRONT_GROUPS } from "../js/config.js";
import { buildPatchPlan, applyPatchPlan, hasTargetEntitlements,
  validateOwnershipChanges } from "../js/ownership.js";
import { encryptProfile, decryptGeneratedProfile } from "../js/profile.js";
import { protectedFingerprint, validateRoundTrip } from "../js/validator.js";
import { patchProfileBytes } from "../js/auto-patch.js";
import { verifyNewSixStoreOriginals } from "../tools/verify-native-six-store-v1261.mjs";

const five = DLC_CATALOG;

function observedProjection() {
  return {
    GameInfo: { InitialVersion: 518, Version: 643, ProfileUID: "puid_synthetic_643", Revision: 1 },
    Player: { ContainerInventories: {}, CurrencyAmounts: {}, Cookbook: {} },
    World: { Villages: [], Characters: [], GridCollection: {}, QuestInfo: {} },
    LastKnownBoughtExpansionsAnyPlatform: [
      "BaseGame", "Expansion01", "Expansion02", "Expansion03", "Expansion04", "WinnieDLC"
    ],
    ExpansionPackOwnershipByPlatform: {
      Nintendo: {
        Entries: [
          ...DLC_CATALOG.map(item => ({ ...item.entitlements.Nintendo })),
          { ...five[4].entitlements.Nintendo },
          {
            PackName: "Expansion4PackDeluxeEdition_Nintendo_OnlineKey",
            PackType: "ConsumableEditionPack",
            Type: "Type_Purchased"
          }
        ]
      },
      Steam: { Entries: DLC_CATALOG.map(item => ({ ...item.entitlements.Steam })) },
      AppleArcade: { Entries: [
        { PackName: "ArcadeContent_Existing", PackType: "Other", Type: "Unchanged" }
      ] }
    },
    Untouched: { provenance: "redacted synthetic projection", sequence: [1, 2, 3] }
  };
}

test("v1.26.1 new expansion is activated with all six native-derived storefronts", () => {
  assert.equal(DLC_CATALOG.length, 5);
  assert.equal(five.length, 5);
  assert.equal(five[4].anyPlatformId, "Expansion04");
  assert.deepEqual([...AUTO_PATCH_PLATFORMS], [...STANDARD_STOREFRONT_GROUPS]);
  for (const group of STANDARD_STOREFRONT_GROUPS) {
    assert.deepEqual(five[4].entitlements[group], {
      PackName: "Expansion4PackExpansionPass_" + group + "_OnlineKey",
      PackType: "ExpansionPack", Type: "Type_Purchased"
    });
  }
  assert.equal(five[4].entitlements.AppleArcade, undefined);
});

test("v1.26.1 redacted Nintendo-643 observation supports missing fifth-pass planning for Steam and other four groups", async () => {
  const before = observedProjection();
  const original = structuredClone(before);
  const protectedHash = await protectedFingerprint(before);
  const plan = buildPatchPlan(before, STANDARD_STOREFRONT_GROUPS, five);
  assert.equal(plan.anyPlatform.length, 0);
  assert.equal(plan.platforms.Nintendo.additions.length, 0);
  assert.equal(plan.platforms.Steam.additions.length, 1);
  for (const group of ["Epic", "Microsoft", "Sony", "Apple"]) {
    assert.equal(plan.platforms[group].createNode, true);
    assert.equal(plan.platforms[group].additions.length, 5);
  }
  const after = structuredClone(before);
  applyPatchPlan(after, plan);
  assert.deepEqual(before, original);
  assert.equal(hasTargetEntitlements(after, STANDARD_STOREFRONT_GROUPS, five), true);
  assert.equal(validateOwnershipChanges(before, after, STANDARD_STOREFRONT_GROUPS, plan), true);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Nintendo,
    before.ExpansionPackOwnershipByPlatform.Nintendo);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.AppleArcade,
    before.ExpansionPackOwnershipByPlatform.AppleArcade);
  const decoded = await decryptGeneratedProfile(await encryptProfile(after));
  await validateRoundTrip(after, decoded, before, STANDARD_STOREFRONT_GROUPS,
    plan, protectedHash, five);
  const repeat = buildPatchPlan(decoded, STANDARD_STOREFRONT_GROUPS, five);
  assert.deepEqual(repeat.anyPlatform, []);
  assert.ok(Object.values(repeat.platforms).every(item => item.additions.length === 0));
});

test("v1.26.1 never overwrites mismatched existing fifth-pass metadata", () => {
  const value = observedProjection();
  value.ExpansionPackOwnershipByPlatform.Nintendo.Entries.find(item =>
    item.PackName === five[4].entitlements.Nintendo.PackName).Type = "Type_Unknown";
  const before = structuredClone(value);
  const plan = buildPatchPlan(value, STANDARD_STOREFRONT_GROUPS, five);
  assert.equal(plan.platforms.Nintendo.additions.length, 0);
  const after = structuredClone(value);
  applyPatchPlan(after, plan);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Nintendo,
    before.ExpansionPackOwnershipByPlatform.Nintendo);
});

test("validated profile structure accepts source-observed version 643 and newer values", async () => {
  const input = observedProjection();
  const result = await patchProfileBytes(await encryptProfile(input));
  assert.equal(result.status, "patched");
  assert.equal(result.version, 643);
  assert.equal(result.plan.anyPlatform.length, 0);
  assert.equal(result.plan.platforms.Nintendo.additions.length, 0);
  assert.equal(result.plan.platforms.Steam.additions.length, 1);
  assert.ok(["Epic", "Microsoft", "Sony", "Apple"].every(group =>
    result.plan.platforms[group].additions.length === 5));
  const after = await decryptGeneratedProfile(result.output);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Nintendo,
    input.ExpansionPackOwnershipByPlatform.Nintendo);
  assert.deepEqual(after.Untouched, input.Untouched);
  const future = structuredClone(input);
  future.GameInfo.Version = 750;
  const next = await patchProfileBytes(await encryptProfile(future));
  assert.equal(next.version, 750);
  assert.equal(next.status, "patched");
});

test("new-build native static verifier refuses missing or synthetic source originals", () => {
  assert.throws(() => verifyNewSixStoreOriginals({
    nso: Buffer.alloc(16), text: Buffer.alloc(16), rodata: Buffer.alloc(16),
    literals: Buffer.from("[]"), protoDb: Buffer.alloc(16), dump: Buffer.from("")
  }), /static proof failed/);
});
