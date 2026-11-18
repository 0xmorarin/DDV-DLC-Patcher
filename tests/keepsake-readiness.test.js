import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_PATCH_PLATFORMS, DLC_CATALOG } from "../js/config.js";
import { applyPatchPlan, buildPatchPlan, hasTargetEntitlements, validateOwnershipChanges } from "../js/ownership.js";
import { decryptGeneratedProfile, encryptProfile, isDDVProfile, loadProfile } from "../js/profile.js";
import { protectedFingerprint, validatePatchedProfile, validateRoundTrip } from "../js/validator.js";

function fixture() {
  return {
    LastKnownBoughtExpansionsAnyPlatform: ["UnknownExpansion"],
    ExpansionPackOwnershipByPlatform: {
      Nintendo: {
        Entries: [{ PackName: "Unknown_Nintendo", PackType: "Other", Type: "Unchanged" }],
        UnrelatedField: { keep: [1, 2] }
      },
      Steam: {
        Entries: [{ PackName: "Unknown_Steam", PackType: "Other", Type: "Unchanged" }]
      },
      UnknownPlatform: { Entries: [{ PackName: "Unknown_Other", PackType: "Other", Type: "Unchanged" }] }
    },
    Unrelated: { nested: ["preserve", 42] }
  };
}
function patched(before, platforms) {
  const value = structuredClone(before);
  const plan = buildPatchPlan(before, platforms);
  applyPatchPlan(value, plan);
  return { value, plan };
}

test("PRE-RELEASE GATE: only four evidence-backed DLC definitions are active", () => {
  assert.deepEqual(DLC_CATALOG.map(item => item.anyPlatformId),
    ["Expansion01", "Expansion02", "Expansion03", "WinnieDLC"]);
  assert.ok(DLC_CATALOG.every(item => !item.displayName.includes("Keepsake")));
});

test("automatic patching targets all currently verified platforms without a user mode selector", () => {
  assert.deepEqual([...AUTO_PATCH_PLATFORMS], ["Nintendo", "Steam"]);
  assert.equal(new Set(AUTO_PATCH_PLATFORMS).size, AUTO_PATCH_PLATFORMS.length);
  assert.ok(DLC_CATALOG.every(item => AUTO_PATCH_PLATFORMS.every(platform => item.entitlements[platform])));
});

test("Steam-only edit preserves Nintendo and unknown platform records", () => {
  const before = fixture();
  const { value, plan } = patched(before, ["Steam"]);
  assert.equal(plan.platforms.Steam.additions.length, DLC_CATALOG.length);
  assert.deepEqual(value.ExpansionPackOwnershipByPlatform.Nintendo,
    before.ExpansionPackOwnershipByPlatform.Nintendo);
  assert.deepEqual(value.ExpansionPackOwnershipByPlatform.UnknownPlatform,
    before.ExpansionPackOwnershipByPlatform.UnknownPlatform);
  assert.deepEqual(value.Unrelated, before.Unrelated);
  assert.equal(validateOwnershipChanges(before, value, ["Steam"], plan), true);
});

test("missing ownership root is created without disturbing unrelated data", () => {
  const before = fixture();
  delete before.ExpansionPackOwnershipByPlatform;
  const { value, plan } = patched(before, ["Nintendo"]);
  assert.equal(plan.createRoot, true);
  assert.equal(plan.platforms.Nintendo.createNode, true);
  assert.equal(hasTargetEntitlements(value, ["Nintendo"]), true);
  assert.deepEqual(value.Unrelated, before.Unrelated);
  assert.equal(validateOwnershipChanges(before, value, ["Nintendo"], plan), true);
});

test("missing selected platform node is created without changing other platform", () => {
  const before = fixture();
  delete before.ExpansionPackOwnershipByPlatform.Nintendo;
  const { value, plan } = patched(before, ["Nintendo"]);
  assert.equal(plan.createRoot, false);
  assert.equal(plan.platforms.Nintendo.createNode, true);
  assert.deepEqual(value.ExpansionPackOwnershipByPlatform.Steam,
    before.ExpansionPackOwnershipByPlatform.Steam);
  assert.equal(validateOwnershipChanges(before, value, ["Nintendo"], plan), true);
});

test("partial ownership adds only missing records, independently per platform", () => {
  const before = fixture();
  const known = DLC_CATALOG[0];
  before.LastKnownBoughtExpansionsAnyPlatform.push(known.anyPlatformId);
  before.ExpansionPackOwnershipByPlatform.Nintendo.Entries.push({ ...known.entitlements.Nintendo });
  const { value, plan } = patched(before, ["Nintendo", "Steam"]);
  assert.equal(plan.anyPlatform.length, DLC_CATALOG.length - 1);
  assert.equal(plan.platforms.Nintendo.additions.length, DLC_CATALOG.length - 1);
  assert.equal(plan.platforms.Steam.additions.length, DLC_CATALOG.length);
  assert.equal(hasTargetEntitlements(value, ["Nintendo", "Steam"]), true);
  assert.equal(validateOwnershipChanges(before, value, ["Nintendo", "Steam"], plan), true);
});

test("all-owned repeated patch is a no-op", () => {
  const before = fixture();
  const { value } = patched(before, ["Nintendo", "Steam"]);
  const { value: repeated, plan } = patched(value, ["Nintendo", "Steam"]);
  assert.deepEqual(plan.anyPlatform, []);
  assert.deepEqual(plan.platforms.Nintendo.additions, []);
  assert.deepEqual(plan.platforms.Steam.additions, []);
  assert.deepEqual(repeated, value);
  assert.equal(validateOwnershipChanges(value, repeated, ["Nintendo", "Steam"], plan), true);
});

test("building a plan does not mutate its input", () => {
  const before = fixture();
  const clone = structuredClone(before);
  buildPatchPlan(before, ["Nintendo", "Steam"]);
  assert.deepEqual(before, clone);
});

test("unsupported any-platform and selected platform structures fail closed", () => {
  const nonStrings = fixture();
  nonStrings.LastKnownBoughtExpansionsAnyPlatform.push({ wrong: true });
  assert.throws(() => buildPatchPlan(nonStrings, ["Nintendo"]));
  const nonList = fixture();
  nonList.ExpansionPackOwnershipByPlatform.Steam.Entries = "not an array";
  assert.throws(() => buildPatchPlan(nonList, ["Steam"]));
  const badRecords = fixture();
  badRecords.ExpansionPackOwnershipByPlatform.Nintendo.Entries = [13, null];
  assert.throws(() => buildPatchPlan(badRecords, ["Nintendo"]));
});

test("contradictory existing entitlement fails instead of being overwritten", () => {
  const before = fixture();
  before.ExpansionPackOwnershipByPlatform.Nintendo.Entries.push({
    ...DLC_CATALOG[0].entitlements.Nintendo,
    Type: "Type_Contradictory"
  });
  assert.throws(() => buildPatchPlan(before, ["Nintendo"]));
});

test("validation rejects new unrelated entries in ownership root", () => {
  const before = fixture();
  const { value, plan } = patched(before, ["Nintendo"]);
  value.ExpansionPackOwnershipByPlatform.InjectedPlatform = { Entries: [] };
  assert.equal(validateOwnershipChanges(before, value, ["Nintendo"], plan), false);
});

test("validation rejects modification of previously existing ownership entries", () => {
  const before = fixture();
  const { value, plan } = patched(before, ["Nintendo"]);
  value.ExpansionPackOwnershipByPlatform.Nintendo.Entries[0].Type = "Modified";
  assert.equal(validateOwnershipChanges(before, value, ["Nintendo"], plan), false);
});

test("protected profile fingerprint rejects changes outside ownership fields", async () => {
  const before = fixture();
  const fingerprint = await protectedFingerprint(before);
  const { value, plan } = patched(before, ["Nintendo"]);
  await validatePatchedProfile(before, value, ["Nintendo"], plan, fingerprint);
  value.Unrelated.nested[0] = "tampered";
  await assert.rejects(validatePatchedProfile(before, value, ["Nintendo"], plan, fingerprint));
});

test("synthetic minimal DDV profile encrypts and decrypts with ownership data intact", async () => {
  const base = {
    ...fixture(),
    GameInfo: { InitialVersion: 591, Version: 626, ProfileUID: "puid_synthetic_fixture", Revision: 1 },
    Player: { ContainerInventories: {}, CurrencyAmounts: {}, Cookbook: {} },
    World: { Villages: [], Characters: [], GridCollection: {}, QuestInfo: {} }
  };
  assert.equal(isDDVProfile(base), true);
  const before = structuredClone(base);
  const fingerprint = await protectedFingerprint(before);
  const { value, plan } = patched(before, ["Nintendo", "Steam"]);
  const bytes = await encryptProfile(value);
  const decoded = await decryptGeneratedProfile(bytes);
  assert.deepEqual(decoded, value);
  await validateRoundTrip(value, decoded, before, ["Nintendo", "Steam"], plan, fingerprint);
  const loaded = await loadProfile(bytes);
  assert.equal(loaded.inputType, "encrypted");
  assert.deepEqual(loaded.profile, value);
});


test("an unexpected any-platform identifier is not accepted as part of a patch", () => {
  const before = fixture();
  const { value, plan } = patched(before, ["Nintendo"]);
  value.LastKnownBoughtExpansionsAnyPlatform.push("UnapprovedExpansion");
  assert.equal(validateOwnershipChanges(before, value, ["Nintendo"], plan), false);
});

test("removing unknown existing ownership values is never permitted", () => {
  const before = fixture();
  const { value, plan } = patched(before, ["Nintendo"]);
  value.LastKnownBoughtExpansionsAnyPlatform =
    value.LastKnownBoughtExpansionsAnyPlatform.filter(id => id !== "UnknownExpansion");
  assert.equal(validateOwnershipChanges(before, value, ["Nintendo"], plan), false);
});


test("unknown pre-existing edition-like ownership records are preserved without implying validity", () => {
  const before = fixture();
  const editionLike = {
    PackName: "ResearchSyntheticEdition_DO_NOT_USE_AS_REAL_ID",
    PackType: "ResearchSyntheticEditionPack",
    Type: "Type_Purchased"
  };
  before.ExpansionPackOwnershipByPlatform.Nintendo.Entries.push(editionLike);
  const { value, plan } = patched(before, ["Nintendo", "Steam"]);
  assert.deepEqual(value.ExpansionPackOwnershipByPlatform.Nintendo.Entries[1], editionLike);
  assert.deepEqual(value.ExpansionPackOwnershipByPlatform.Steam.Entries[0],
    before.ExpansionPackOwnershipByPlatform.Steam.Entries[0]);
  assert.equal(validateOwnershipChanges(before, value, ["Nintendo", "Steam"], plan), true);
  const second = buildPatchPlan(value, ["Nintendo", "Steam"]);
  assert.equal(second.anyPlatform.length, 0);
  assert.equal(second.platforms.Nintendo.additions.length, 0);
  assert.equal(second.platforms.Steam.additions.length, 0);
});
