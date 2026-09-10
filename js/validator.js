import { deepEqual, hasTargetEntitlements, validateOwnershipChanges } from "./ownership.js";

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

async function sha256(text) {
  if (!globalThis.crypto?.subtle) throw new Error("This browser does not support the cryptographic API required by the patcher.");
  const data = new TextEncoder().encode(text);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data));
  return [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
}

function protectedObject(profile) {
  return Object.fromEntries(Object.entries(profile).filter(([key]) => key !== "LastKnownBoughtExpansionsAnyPlatform" && key !== "ExpansionPackOwnershipByPlatform"));
}

export async function protectedFingerprint(profile) {
  return sha256(stableStringify(protectedObject(profile)));
}

export async function validatePatchedProfile(before, after, selectedPlatforms, plan, protectedHash) {
  if (!hasTargetEntitlements(after, selectedPlatforms)) throw new Error("Required expansion ownership records were not found after patching.");
  if (!validateOwnershipChanges(before, after, selectedPlatforms, plan)) throw new Error("DLC ownership data changed outside the allowed patch plan.");
  if (await protectedFingerprint(after) !== protectedHash) throw new Error("Data outside the DLC ownership fields changed unexpectedly.");
}

export async function validateRoundTrip(expected, decoded, before, selectedPlatforms, plan, protectedHash) {
  if (!deepEqual(expected, decoded)) throw new Error("The encrypted profile did not round-trip to the expected patched data.");
  await validatePatchedProfile(before, decoded, selectedPlatforms, plan, protectedHash);
}
