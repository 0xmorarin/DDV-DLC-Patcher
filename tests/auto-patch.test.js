import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AUTO_PATCH_PLATFORMS, DLC_CATALOG, STANDARD_STOREFRONT_GROUPS } from "../js/config.js";
import { patchProfileBytes } from "../js/auto-patch.js";
import { decryptGeneratedProfile, encryptProfile } from "../js/profile.js";
import { hasTargetEntitlements } from "../js/ownership.js";

function sample() {
  return {
    GameInfo: { InitialVersion: 591, Version: 626, ProfileUID: "puid_auto_patch_synthetic", Revision: 1 },
    Player: { Name: "Synthetic", ContainerInventories: {}, CurrencyAmounts: {}, Cookbook: {} },
    World: { Villages: [], Characters: [], GridCollection: {}, QuestInfo: {} },
    LastKnownBoughtExpansionsAnyPlatform: ["ExistingUnknownExpansion"],
    ExpansionPackOwnershipByPlatform: {
      Nintendo: {
        Entries: [{ PackName: "ResearchSyntheticDeluxe_LeaveUntouched", PackType: "Edition", Type: "Type_Purchased" }],
        PreserveThis: { value: true }
      },
      SomeOtherPlatform: { Entries: [{ PackName: "Unknown_Existing", PackType: "Other", Type: "Unknown" }] },
      AppleArcade: { Entries: [{ PackName: "UnrelatedArcadeSource", PackType: "Other", Type: "Unknown" }] }
    },
    UnknownProtectedField: { nested: [1, 2, 3] }
  };
}

function asBytes(profile) {
  return new TextEncoder().encode(JSON.stringify(profile));
}

test("standard cross-save uses one Profile codec; AppleArcade is never a patch target", async () => {
  assert.deepEqual([...STANDARD_STOREFRONT_GROUPS], ["Nintendo", "Steam", "Epic", "Microsoft", "Sony", "Apple"]);
  assert.ok(!STANDARD_STOREFRONT_GROUPS.includes("AppleArcade"));
  assert.ok(!AUTO_PATCH_PLATFORMS.includes("AppleArcade"));
  assert.ok(AUTO_PATCH_PLATFORMS.every(group => STANDARD_STOREFRONT_GROUPS.includes(group)));
  const original = sample();
  const result = await patchProfileBytes(asBytes(original));
  const decoded = await decryptGeneratedProfile(result.output);
  assert.deepEqual(decoded.ExpansionPackOwnershipByPlatform.AppleArcade, original.ExpansionPackOwnershipByPlatform.AppleArcade);
  assert.equal(result.plan.platforms.AppleArcade, undefined);
  const repeated = await patchProfileBytes(result.output);
  assert.equal(repeated.status, "already-patched");
  assert.equal(repeated.output, null);
});

test("drag-file workflow patches every verified platform without user choice", async () => {
  const original = sample();
  const { status, output, plan, platforms, totalAdded, inputType } = await patchProfileBytes(asBytes(original));
  assert.equal(status, "patched");
  assert.equal(inputType, "plain");
  assert.deepEqual(platforms, [...AUTO_PATCH_PLATFORMS]);
  assert.ok(output instanceof Uint8Array);
  assert.equal(plan.anyPlatform.length, DLC_CATALOG.length);
  assert.equal(plan.platforms.Nintendo.additions.length, DLC_CATALOG.length);
  assert.equal(plan.platforms.Steam.additions.length, DLC_CATALOG.length);
  assert.equal(totalAdded, DLC_CATALOG.length * (1 + platforms.length));
  const after = await decryptGeneratedProfile(output);
  assert.equal(hasTargetEntitlements(after, platforms), true);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.SomeOtherPlatform, original.ExpansionPackOwnershipByPlatform.SomeOtherPlatform);
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Nintendo.PreserveThis, { value: true });
  assert.deepEqual(after.ExpansionPackOwnershipByPlatform.Nintendo.Entries[0], original.ExpansionPackOwnershipByPlatform.Nintendo.Entries[0]);
  assert.deepEqual(after.UnknownProtectedField, original.UnknownProtectedField);
  assert.deepEqual(original.LastKnownBoughtExpansionsAnyPlatform, ["ExistingUnknownExpansion"], "input must remain immutable");
});

test("all DLCs owned across every verified platform skips writing and downloading", async () => {
  const first = await patchProfileBytes(asBytes(sample()));
  const second = await patchProfileBytes(first.output);
  assert.equal(second.status, "already-patched");
  assert.equal(second.inputType, "encrypted");
  assert.equal(second.output, null);
  assert.equal(second.totalAdded, 0);
  assert.equal(second.plan.anyPlatform.length, 0);
  assert.ok(Object.values(second.plan.platforms).every(p => p.additions.length === 0));
});

test("automatic patch only fills missing platform entries in a partially patched profile", async () => {
  const first = await patchProfileBytes(asBytes(sample()), ["Nintendo"]);
  const second = await patchProfileBytes(first.output);
  assert.equal(second.status, "patched");
  assert.equal(second.plan.anyPlatform.length, 0);
  assert.equal(second.plan.platforms.Nintendo.additions.length, 0);
  assert.equal(second.plan.platforms.Steam.additions.length, DLC_CATALOG.length);
  const after = await decryptGeneratedProfile(second.output);
  assert.equal(hasTargetEntitlements(after, AUTO_PATCH_PLATFORMS), true);
});

test("raw encrypted profile input is recognized and patched automatically", async () => {
  const raw = await encryptProfile(sample());
  const result = await patchProfileBytes(raw);
  assert.equal(result.inputType, "encrypted");
  assert.equal(result.status, "patched");
  assert.ok(result.output?.length > 0);
});

test("conflicting existing ownership records stop processing without generating a file", async () => {
  const profile = sample();
  profile.ExpansionPackOwnershipByPlatform.Nintendo.Entries.push({
    ...DLC_CATALOG[0].entitlements.Nintendo, Type: "Type_Contradictory"
  });
  await assert.rejects(() => patchProfileBytes(asBytes(profile)), /unsupported format/);
});

test("malformed and outdated saves fail closed", async () => {
  await assert.rejects(() => patchProfileBytes(new TextEncoder().encode("not a profile")), /validated/);
  const old = sample();
  old.GameInfo.Version = 590;
  await assert.rejects(() => patchProfileBytes(asBytes(old)), /older than/);
});

test("automatic pipeline does not allow duplicate, unsupported or empty platform overrides", async () => {
  for (const selection of [[], ["Nintendo", "Nintendo"], ["UnknownStore"], ["AppleArcade"], ["Steam", "Unknown"]]) {
    await assert.rejects(() => patchProfileBytes(asBytes(sample()), selection), /Unsupported or duplicate/);
  }
});

test("UI has no manual platform selection or patch execution button", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /name="platform"|id="patch-button"/);
  assert.match(html, /id="auto-patch-progress"/);
  assert.match(app, /await patchProfileBytes\(raw\)/);
  assert.match(app, /if \(result\.status === "patched"\)/);
  assert.match(app, /if \(requestId !== loadSerial\) return/);
  assert.doesNotMatch(app, /selectedMode|patchCurrentProfile|patchButton/);
});
