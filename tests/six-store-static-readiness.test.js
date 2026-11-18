import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_PATCH_PLATFORMS, DLC_CATALOG, STANDARD_STOREFRONT_GROUPS } from "../js/config.js";
import { applyPatchPlan, buildPatchPlan, hasTargetEntitlements, validateOwnershipChanges } from "../js/ownership.js";
import { decryptGeneratedProfile, encryptProfile } from "../js/profile.js";
import { protectedFingerprint, validatePatchedProfile, validateRoundTrip } from "../js/validator.js";
import { patchProfileBytes } from "../js/auto-patch.js";
import { SIX_STORE_CANDIDATE_CATALOG, ORIGINAL_IAP_UNIQUE_NAMES_V1253 } from "./fixtures/six-store-candidate-catalog.js";

const six = [...STANDARD_STOREFRONT_GROUPS];
const extra = ["Epic", "Microsoft", "Sony", "Apple"];

function fixture() {
  return {
    GameInfo: { InitialVersion: 518, Version: 626, ProfileUID: "puid_six_store_synthetic", Revision: 1 },
    Player: { Name: "Six-store fixture", ContainerInventories: {}, CurrencyAmounts: {}, Cookbook: {} },
    World: { Villages: [], Characters: [], GridCollection: {}, QuestInfo: {} },
    LastKnownBoughtExpansionsAnyPlatform: ["UnknownPriorExpansion"],
    ExpansionPackOwnershipByPlatform: {
      Nintendo: {
        Entries: [{ PackName: "ExistingEdition_Nintendo", PackType: "Edition", Type: "Unknown" }],
        UnrelatedField: { retained: true }
      },
      Steam: { Entries: [] },
      Epic: {
        Entries: [{ PackName: "UnverifiedEdition_Epic", PackType: "Edition", Type: "Unknown" }],
        PreserveThis: [1, 2, 3]
      },
      UnrelatedPlatform: {
        Entries: [{ PackName: "Unknown_Unrelated", PackType: "Unknown", Type: "Unknown" }]
      },
      AppleArcade: {
        Entries: [{ PackName: "Arcade_Existing", PackType: "Other", Type: "Unchanged" }]
      }
    },
    ProtectedData: { keep: ["nested", 123] }
  };
}

function applyCandidate(before, platforms = six) {
  const after = structuredClone(before);
  const plan = buildPatchPlan(before, platforms, SIX_STORE_CANDIDATE_CATALOG);
  applyPatchPlan(after, plan);
  return { after, plan };
}

test("static research covers four original expansion UniqueNames for all six normal groups", () => {
  assert.deepEqual(six, ["Nintendo", "Steam", "Epic", "Microsoft", "Sony", "Apple"]);
  assert.equal(new Set(six).size, 6);
  assert.equal(Object.keys(ORIGINAL_IAP_UNIQUE_NAMES_V1253).length, 4);
  assert.deepEqual(SIX_STORE_CANDIDATE_CATALOG.map(item => item.anyPlatformId),
    DLC_CATALOG.map(item => item.anyPlatformId));
  for (const item of SIX_STORE_CANDIDATE_CATALOG) {
    assert.deepEqual(Object.keys(item.entitlements), six);
    for (const platform of six) {
      assert.equal(item.entitlements[platform].PackName,
        ORIGINAL_IAP_UNIQUE_NAMES_V1253[item.id] + "_" + platform + "_OnlineKey");
      assert.equal(item.entitlements[platform].PackType, "ExpansionPack");
      assert.equal(item.entitlements[platform].Type, "Type_Purchased");
    }
    for (const platform of AUTO_PATCH_PLATFORMS) {
      assert.deepEqual(item.entitlements[platform],
        DLC_CATALOG.find(existing => existing.id === item.id).entitlements[platform]);
    }
    assert.equal(item.entitlements.AppleArcade, undefined);
  }
  assert.deepEqual([...AUTO_PATCH_PLATFORMS], six);
  assert.ok(DLC_CATALOG.every(item => extra.every(platform => platform in item.entitlements)));
});

test("six-store isolated planner generates all 24 candidate entries and four common IDs losslessly", async () => {
  const before = fixture();
  const unchanged = structuredClone(before);
  const protectedHash = await protectedFingerprint(before);
  const { after, plan } = applyCandidate(before);
  assert.equal(plan.anyPlatform.length, 4);
  assert.deepEqual(Object.keys(plan.platforms), six);
  assert.equal(plan.platforms.Microsoft.createNode, true);
  assert.equal(plan.platforms.Sony.createNode, true);
  assert.equal(plan.platforms.Apple.createNode, true);
  assert.ok(six.every(platform => plan.platforms[platform].additions.length === 4));
  assert.equal(hasTargetEntitlements(after, six, SIX_STORE_CANDIDATE_CATALOG), true);
  assert.equal(validateOwnershipChanges(before, after, six, plan), true);
  await validatePatchedProfile(before, after, six, plan, protectedHash, SIX_STORE_CANDIDATE_CATALOG);
  assert.deepEqual(before, unchanged);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.AppleArcade,
    before.ExpansionPackOwnershipByPlatform.AppleArcade);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.UnrelatedPlatform,
    before.ExpansionPackOwnershipByPlatform.UnrelatedPlatform);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Epic.PreserveThis, [1, 2, 3]);
  assert.deepEqual(after.ProtectedData, before.ProtectedData);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Nintendo.Entries[0],
    before.ExpansionPackOwnershipByPlatform.Nintendo.Entries[0]);
  const encrypted = await encryptProfile(after);
  const decoded = await decryptGeneratedProfile(encrypted);
  await validateRoundTrip(after, decoded, before, six, plan, protectedHash, SIX_STORE_CANDIDATE_CATALOG);
  assert.deepEqual(decoded, after);
});

test("all-six repeated planning is a no-op without further additions", () => {
  const { after } = applyCandidate(fixture());
  const repeat = buildPatchPlan(after, six, SIX_STORE_CANDIDATE_CATALOG);
  assert.deepEqual(repeat.anyPlatform, []);
  assert.ok(Object.values(repeat.platforms).every(node => node.additions.length === 0));
  assert.equal(repeat.createRoot, false);
});

test("a partly patched research profile only receives the missing records of each group", () => {
  const original = fixture();
  original.LastKnownBoughtExpansionsAnyPlatform.push("Expansion01");
  original.ExpansionPackOwnershipByPlatform.Epic.Entries.push(
    structuredClone(SIX_STORE_CANDIDATE_CATALOG[0].entitlements.Epic));
  original.ExpansionPackOwnershipByPlatform.Steam.Entries.push(
    structuredClone(SIX_STORE_CANDIDATE_CATALOG[0].entitlements.Steam));
  const { after, plan } = applyCandidate(original);
  assert.equal(plan.anyPlatform.length, 3);
  assert.equal(plan.platforms.Epic.additions.length, 3);
  assert.equal(plan.platforms.Steam.additions.length, 3);
  assert.equal(plan.platforms.Microsoft.additions.length, 4);
  assert.equal(plan.platforms.Nintendo.additions.length, 4);
  assert.equal(after.ExpansionPackOwnershipByPlatform.Epic.Entries.filter(
    x => x.PackName === SIX_STORE_CANDIDATE_CATALOG[0].entitlements.Epic.PackName).length, 1);
  assert.equal(validateOwnershipChanges(original, after, six, plan), true);
});

test("each candidate marketplace independently fails closed on conflicting ownership or malformed nodes", () => {
  for (const platform of extra) {
    const conflicting = fixture();
    conflicting.ExpansionPackOwnershipByPlatform[platform] ??= { Entries: [] };
    conflicting.ExpansionPackOwnershipByPlatform[platform].Entries.push({
      ...SIX_STORE_CANDIDATE_CATALOG[0].entitlements[platform],
      Type: "Type_Contradiction"
    });
    assert.throws(() => buildPatchPlan(conflicting, six, SIX_STORE_CANDIDATE_CATALOG),
      /unsupported format/);
    const malformed = fixture();
    malformed.ExpansionPackOwnershipByPlatform[platform] = { Entries: "bad" };
    assert.throws(() => buildPatchPlan(malformed, six, SIX_STORE_CANDIDATE_CATALOG),
      /missing or is not a list/);
  }
});

test("six-store validator detects ownership tampering and protected profile changes", async () => {
  const before = fixture();
  const protectedHash = await protectedFingerprint(before);
  const { after, plan } = applyCandidate(before);
  after.ExpansionPackOwnershipByPlatform.Microsoft.Entries[0].Type = "Type_Wrong";
  assert.equal(hasTargetEntitlements(after, six, SIX_STORE_CANDIDATE_CATALOG), false);
  assert.equal(validateOwnershipChanges(before, after, six, plan), false);
  await assert.rejects(validatePatchedProfile(before, after, six, plan,
    protectedHash, SIX_STORE_CANDIDATE_CATALOG));
  const pristine = applyCandidate(before);
  pristine.after.ProtectedData.keep[0] = "tampered";
  await assert.rejects(validatePatchedProfile(before, pristine.after, six, pristine.plan,
    protectedHash, SIX_STORE_CANDIDATE_CATALOG));
});

test("default patch uses six native-derived store groups and leaves unrelated records intact", async () => {
  const before = fixture();
  const existing = Object.fromEntries(
    ["Nintendo", "Epic", "AppleArcade", "UnrelatedPlatform"].map(platform =>
      [platform, structuredClone(before.ExpansionPackOwnershipByPlatform[platform])]));
  const patched = await patchProfileBytes(await encryptProfile(before));
  assert.equal(patched.status, "patched");
  assert.deepEqual(patched.platforms, six);
  assert.deepEqual(Object.keys(patched.plan.platforms), six);
  assert.equal(patched.plan.anyPlatform.length, 4);
  assert.equal(patched.totalAdded, 28);
  const decoded = await decryptGeneratedProfile(patched.output);
  assert.equal(hasTargetEntitlements(decoded, six), true);
  for (const platform of six) {
    assert.equal(patched.plan.platforms[platform].additions.length, 4);
  }
  for (const platform of ["AppleArcade", "UnrelatedPlatform"]) {
    assert.deepEqual(decoded.ExpansionPackOwnershipByPlatform[platform], existing[platform]);
  }
  assert.deepEqual(decoded.ExpansionPackOwnershipByPlatform.Nintendo.Entries[0],
    existing.Nintendo.Entries[0]);
  assert.deepEqual(decoded.ExpansionPackOwnershipByPlatform.Epic.Entries[0],
    existing.Epic.Entries[0]);
  assert.deepEqual(decoded.ExpansionPackOwnershipByPlatform.Epic.PreserveThis,
    existing.Epic.PreserveThis);
  assert.deepEqual(decoded.ProtectedData, before.ProtectedData);
  const repeated = await patchProfileBytes(patched.output);
  assert.equal(repeated.status, "already-patched");
  assert.equal(repeated.output, null);
  for (const platform of extra) {
    const raw = await encryptProfile(before);
    const single = await patchProfileBytes(raw, [platform]);
    assert.deepEqual(single.platforms, [platform]);
    assert.equal(single.plan.platforms[platform].additions.length, 4);
  }
  for (const invalid of [["AppleArcade"], ["UnknownStore"], ["Sony", "Sony"]]) {
    await assert.rejects(() => patchProfileBytes(new TextEncoder().encode(JSON.stringify(before)), invalid),
      /Unsupported or duplicate/);
  }
});
