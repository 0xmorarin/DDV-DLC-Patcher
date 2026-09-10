import { DLC_CATALOG } from "./config.js";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false;
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const key of ak) if (!(key in b) || !deepEqual(a[key], b[key])) return false;
    return true;
  }
  return false;
}

function familyRank(packName) {
  if (typeof packName !== "string") return null;
  for (let i = 0; i < DLC_CATALOG.length; i++) if (packName.startsWith(DLC_CATALOG[i].family)) return i;
  return null;
}

function findAnyInsertIndex(values, rank) {
  const later = new Set(DLC_CATALOG.slice(rank + 1).map(item => item.anyPlatformId));
  for (let i = 0; i < values.length; i++) if (later.has(values[i])) return i;
  return values.length;
}

function findPlatformInsertIndex(entries, rank) {
  const family = DLC_CATALOG[rank].family;
  let sameFamilyLast = -1;
  for (let i = 0; i < entries.length; i++) {
    const name = isPlainObject(entries[i]) ? entries[i].PackName : null;
    if (typeof name === "string" && name.startsWith(family)) sameFamilyLast = i;
  }
  if (sameFamilyLast >= 0) return sameFamilyLast + 1;
  for (let i = 0; i < entries.length; i++) {
    const name = isPlainObject(entries[i]) ? entries[i].PackName : null;
    const otherRank = familyRank(name);
    if (otherRank !== null && otherRank > rank) return i;
  }
  return entries.length;
}

function inspectSelectedPlatform(root, platform) {
  if (!(platform in root)) return;
  const node = root[platform];
  if (!isPlainObject(node)) throw new Error(`ExpansionPackOwnershipByPlatform.${platform} is not an object.`);
  if (!Array.isArray(node.Entries)) throw new Error(`ExpansionPackOwnershipByPlatform.${platform}.Entries is missing or is not a list.`);
  if (node.Entries.length > 0) {
    const recognized = node.Entries.some(entry => isPlainObject(entry) && typeof entry.PackName === "string");
    if (!recognized) throw new Error(`ExpansionPackOwnershipByPlatform.${platform}.Entries uses an unsupported structure.`);
  }
}

export function inspectOwnershipSchema(profile, selectedPlatforms) {
  const anyPlatform = profile.LastKnownBoughtExpansionsAnyPlatform;
  if (!Array.isArray(anyPlatform)) throw new Error("LastKnownBoughtExpansionsAnyPlatform is missing or is not a list.");
  if (!anyPlatform.every(value => typeof value === "string")) throw new Error("LastKnownBoughtExpansionsAnyPlatform contains an unsupported value type.");
  const root = profile.ExpansionPackOwnershipByPlatform;
  if (root !== undefined && !isPlainObject(root)) throw new Error("ExpansionPackOwnershipByPlatform has an unsupported structure.");
  if (isPlainObject(root)) for (const platform of selectedPlatforms) inspectSelectedPlatform(root, platform);
}

function checkExistingEntitlement(entries, expected) {
  const matches = entries.filter(entry => isPlainObject(entry) && entry.PackName === expected.PackName);
  if (matches.length === 0) return false;
  for (const entry of matches) {
    if (entry.PackType !== expected.PackType || entry.Type !== expected.Type) throw new Error(`Existing ownership entry has an unsupported format: ${expected.PackName}`);
  }
  return true;
}

export function buildPatchPlan(profile, selectedPlatforms) {
  inspectOwnershipSchema(profile, selectedPlatforms);
  const plan = { anyPlatform: [], platforms: {}, createRoot: profile.ExpansionPackOwnershipByPlatform === undefined };
  const anyWorking = profile.LastKnownBoughtExpansionsAnyPlatform.slice();
  for (let rank = 0; rank < DLC_CATALOG.length; rank++) {
    const value = DLC_CATALOG[rank].anyPlatformId;
    if (!anyWorking.includes(value)) {
      const index = findAnyInsertIndex(anyWorking, rank);
      anyWorking.splice(index, 0, value);
      plan.anyPlatform.push({ index, value, dlcId: DLC_CATALOG[rank].id });
    }
  }
  const root = profile.ExpansionPackOwnershipByPlatform ?? {};
  for (const platform of selectedPlatforms) {
    const exists = platform in root;
    const entries = exists ? root[platform].Entries : [];
    const working = entries.slice();
    const additions = [];
    for (let rank = 0; rank < DLC_CATALOG.length; rank++) {
      const expected = DLC_CATALOG[rank].entitlements[platform];
      if (!expected) throw new Error(`No DLC entitlement definition exists for ${platform}.`);
      if (!checkExistingEntitlement(working, expected)) {
        const index = findPlatformInsertIndex(working, rank);
        const entry = { ...expected };
        working.splice(index, 0, entry);
        additions.push({ index, entry, dlcId: DLC_CATALOG[rank].id });
      }
    }
    plan.platforms[platform] = { createNode: !exists, additions };
  }
  return plan;
}

export function applyPatchPlan(profile, plan) {
  for (const addition of plan.anyPlatform) profile.LastKnownBoughtExpansionsAnyPlatform.splice(addition.index, 0, addition.value);
  if (plan.createRoot) profile.ExpansionPackOwnershipByPlatform = {};
  const root = profile.ExpansionPackOwnershipByPlatform;
  for (const [platform, platformPlan] of Object.entries(plan.platforms)) {
    if (platformPlan.createNode) root[platform] = { Entries: [] };
    for (const addition of platformPlan.additions) root[platform].Entries.splice(addition.index, 0, { ...addition.entry });
  }
  return profile;
}

export function hasTargetEntitlements(profile, selectedPlatforms) {
  if (!DLC_CATALOG.every(item => profile.LastKnownBoughtExpansionsAnyPlatform.includes(item.anyPlatformId))) return false;
  const root = profile.ExpansionPackOwnershipByPlatform;
  if (!isPlainObject(root)) return false;
  for (const platform of selectedPlatforms) {
    const node = root[platform];
    if (!isPlainObject(node) || !Array.isArray(node.Entries)) return false;
    for (const item of DLC_CATALOG) {
      const expected = item.entitlements[platform];
      const matches = node.Entries.filter(entry => isPlainObject(entry) && entry.PackName === expected.PackName);
      if (matches.length === 0) return false;
      if (matches.some(entry => entry.PackType !== expected.PackType || entry.Type !== expected.Type)) return false;
    }
  }
  return true;
}

function arrayWithOnlyAllowedInsertions(before, after, allowed) {
  let i = 0;
  const remaining = allowed.slice();
  for (const value of after) {
    if (i < before.length && deepEqual(value, before[i])) {
      i++;
      continue;
    }
    const index = remaining.findIndex(candidate => deepEqual(candidate, value));
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return i === before.length && remaining.length === 0;
}

export function validateOwnershipChanges(before, after, selectedPlatforms, plan) {
  const allowedAny = plan.anyPlatform.map(item => item.value);
  if (!arrayWithOnlyAllowedInsertions(before.LastKnownBoughtExpansionsAnyPlatform, after.LastKnownBoughtExpansionsAnyPlatform, allowedAny)) return false;
  const beforeRoot = before.ExpansionPackOwnershipByPlatform;
  const afterRoot = after.ExpansionPackOwnershipByPlatform;
  if (!isPlainObject(afterRoot)) return false;
  const beforeKeys = isPlainObject(beforeRoot) ? Object.keys(beforeRoot) : [];
  const allowedNewKeys = new Set(Object.entries(plan.platforms).filter(([,value]) => value.createNode).map(([key]) => key));
  for (const key of Object.keys(afterRoot)) {
    if (!beforeKeys.includes(key) && !allowedNewKeys.has(key)) return false;
  }
  for (const key of beforeKeys) if (!(key in afterRoot)) return false;
  for (const key of Object.keys(afterRoot)) {
    const isSelected = selectedPlatforms.includes(key);
    const beforeNode = isPlainObject(beforeRoot) ? beforeRoot[key] : undefined;
    if (!isSelected) {
      if (!deepEqual(beforeNode, afterRoot[key])) return false;
      continue;
    }
    const platformPlan = plan.platforms[key];
    if (!platformPlan) return false;
    const afterNode = afterRoot[key];
    if (!isPlainObject(afterNode) || !Array.isArray(afterNode.Entries)) return false;
    if (platformPlan.createNode) {
      if (Object.keys(afterNode).length !== 1 || !("Entries" in afterNode)) return false;
      if (!arrayWithOnlyAllowedInsertions([], afterNode.Entries, platformPlan.additions.map(item => item.entry))) return false;
    } else {
      if (!isPlainObject(beforeNode) || !Array.isArray(beforeNode.Entries)) return false;
      const beforeOther = Object.fromEntries(Object.entries(beforeNode).filter(([name]) => name !== "Entries"));
      const afterOther = Object.fromEntries(Object.entries(afterNode).filter(([name]) => name !== "Entries"));
      if (!deepEqual(beforeOther, afterOther)) return false;
      if (!arrayWithOnlyAllowedInsertions(beforeNode.Entries, afterNode.Entries, platformPlan.additions.map(item => item.entry))) return false;
    }
  }
  return true;
}

export function summarizePlan(plan, selectedPlatforms) {
  const addedByDlc = new Map(DLC_CATALOG.map(item => [item.id, { name: item.displayName, sources: [] }]));
  for (const addition of plan.anyPlatform) addedByDlc.get(addition.dlcId).sources.push("Any-platform");
  for (const platform of selectedPlatforms) {
    for (const addition of plan.platforms[platform].additions) addedByDlc.get(addition.dlcId).sources.push(platform);
  }
  return [...addedByDlc.values()];
}

export { deepEqual };
