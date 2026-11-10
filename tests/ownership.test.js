import test from "node:test";
import assert from "node:assert/strict";
import { DLC_CATALOG } from "../js/config.js";
import { applyPatchPlan, buildPatchPlan, hasTargetEntitlements, validateOwnershipChanges } from "../js/ownership.js";

function fixture() {
  return {
    LastKnownBoughtExpansionsAnyPlatform: ["UnrelatedExpansion"],
    ExpansionPackOwnershipByPlatform: {
      Nintendo: {
        Entries: [{ PackName: "Unrelated_Nintendo", PackType: "Other", Type: "Unchanged" }],
        KeepMe: { unchanged: true }
      },
      Steam: { Entries: [{ PackName: "Unrelated_Steam", PackType: "Other", Type: "Unchanged" }] }
    },
    UnrelatedSaveData: { nested: [1, 2, 3] }
  };
}

test("existing catalog keys remain registered", () => {
  for (const key of ["Expansion01", "Expansion02", "Expansion03", "WinnieDLC"]) {
    assert.ok(DLC_CATALOG.some(item => item.anyPlatformId === key), key);
  }
});

test("Nintendo-only patch does not mutate Steam or unrelated profile data", () => {
  const before = fixture();
  const after = structuredClone(before);
  const plan = buildPatchPlan(before, ["Nintendo"]);
  applyPatchPlan(after, plan);
  assert.equal(plan.anyPlatform.length, DLC_CATALOG.length);
  assert.equal(plan.platforms.Nintendo.additions.length, DLC_CATALOG.length);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Steam, before.ExpansionPackOwnershipByPlatform.Steam);
  assert.deepEqual(after.UnrelatedSaveData, before.UnrelatedSaveData);
  assert.equal(hasTargetEntitlements(after, ["Nintendo"]), true);
  assert.equal(validateOwnershipChanges(before, after, ["Nintendo"], plan), true);
});

test("repeated patch is idempotent", () => {
  const value = fixture();
  applyPatchPlan(value, buildPatchPlan(value, ["Nintendo"]));
  const again = buildPatchPlan(value, ["Nintendo"]);
  assert.equal(again.anyPlatform.length, 0);
  assert.equal(again.platforms.Nintendo.additions.length, 0);
});

test("both-platform patch preserves unknown ownership entries", () => {
  const before = fixture();
  const after = structuredClone(before);
  const plan = buildPatchPlan(before, ["Nintendo", "Steam"]);
  applyPatchPlan(after, plan);
  assert.equal(hasTargetEntitlements(after, ["Nintendo", "Steam"]), true);
  assert.equal(validateOwnershipChanges(before, after, ["Nintendo", "Steam"], plan), true);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Nintendo.Entries[0],
    before.ExpansionPackOwnershipByPlatform.Nintendo.Entries[0]);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Steam.Entries[0],
    before.ExpansionPackOwnershipByPlatform.Steam.Entries[0]);
});

test("preowned DLC is not duplicated", () => {
  const before = fixture();
  before.LastKnownBoughtExpansionsAnyPlatform.push(DLC_CATALOG[0].anyPlatformId);
  before.ExpansionPackOwnershipByPlatform.Nintendo.Entries.push({ ...DLC_CATALOG[0].entitlements.Nintendo });
  const after = structuredClone(before);
  const plan = buildPatchPlan(before, ["Nintendo"]);
  applyPatchPlan(after, plan);
  assert.equal(plan.anyPlatform.length, DLC_CATALOG.length - 1);
  assert.equal(plan.platforms.Nintendo.additions.length, DLC_CATALOG.length - 1);
  assert.equal(validateOwnershipChanges(before, after, ["Nintendo"], plan), true);
});

test("invalid ownership schema and contradictory records fail closed", () => {
  const badSchema = fixture();
  badSchema.LastKnownBoughtExpansionsAnyPlatform.push(123);
  assert.throws(() => buildPatchPlan(badSchema, ["Nintendo"]));
  const conflict = fixture();
  conflict.ExpansionPackOwnershipByPlatform.Nintendo.Entries.push({
    ...DLC_CATALOG[0].entitlements.Nintendo,
    Type: "Type_Contradictory"
  });
  assert.throws(() => buildPatchPlan(conflict, ["Nintendo"]));
});
