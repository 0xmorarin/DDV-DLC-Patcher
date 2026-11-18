import { AUTO_PATCH_PLATFORMS, catalogForProfileVersion } from "./config.js";
import { applyPatchPlan, buildPatchPlan } from "./ownership.js";
import { decryptGeneratedProfile, encryptProfile, loadProfile, validateProfileVersion } from "./profile.js";
import { protectedFingerprint, validatePatchedProfile, validateRoundTrip } from "./validator.js";

export async function patchProfileBytes(raw, platforms = AUTO_PATCH_PLATFORMS) {
  if (!Array.isArray(platforms) || platforms.length === 0 ||
      new Set(platforms).size !== platforms.length ||
      platforms.some(platform => !AUTO_PATCH_PLATFORMS.includes(platform))) {
    throw new Error("Unsupported or duplicate target platform.");
  }

  const { profile, inputType } = await loadProfile(raw);
  const version = validateProfileVersion(profile);
  const catalog = catalogForProfileVersion(version);
  const before = structuredClone(profile);
  const plan = buildPatchPlan(before, platforms, catalog);
  const totalAdded = plan.anyPlatform.length +
    Object.values(plan.platforms).reduce((sum, entry) => sum + entry.additions.length, 0);

  if (totalAdded === 0) {
    return { status: "already-patched", profile: before, inputType, version,
      platforms: platforms.slice(), catalog, plan, totalAdded, output: null };
  }

  const protectedHash = await protectedFingerprint(before);
  const after = structuredClone(before);
  applyPatchPlan(after, plan);
  await validatePatchedProfile(before, after, platforms, plan, protectedHash, catalog);

  const output = await encryptProfile(after);
  const decoded = await decryptGeneratedProfile(output);
  await validateRoundTrip(after, decoded, before, platforms, plan, protectedHash, catalog);

  return { status: "patched", profile: before, inputType, version,
    platforms: platforms.slice(), catalog, plan, totalAdded, output };
}
