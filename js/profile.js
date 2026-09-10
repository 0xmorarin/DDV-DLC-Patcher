import { HEX_KEY, MIN_SUPPORTED_PROFILE_VERSION, ZIP_INNER_NAME } from "./config.js";
import { aes256EcbDecrypt, aes256EcbEncrypt, hexToBytes } from "./aes.js";
import { createZipEntry, readZipEntry } from "./zip.js";

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();
const key = hexToBytes(HEX_KEY);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDDVProfile(obj) {
  if (!isPlainObject(obj)) return false;
  const gameInfo = obj.GameInfo;
  const player = obj.Player;
  const world = obj.World;
  if (!isPlainObject(gameInfo) || !isPlainObject(player) || !isPlainObject(world)) return false;
  if (!Number.isInteger(gameInfo.InitialVersion) || !Number.isInteger(gameInfo.Version)) return false;
  if (typeof gameInfo.ProfileUID !== "string" || !gameInfo.ProfileUID.startsWith("puid_")) return false;
  if (!("Revision" in gameInfo)) return false;
  if (!isPlainObject(player.ContainerInventories)) return false;
  if (!isPlainObject(player.CurrencyAmounts)) return false;
  if (!isPlainObject(player.Cookbook)) return false;
  if (!Array.isArray(world.Villages)) return false;
  if (!Array.isArray(world.Characters)) return false;
  if (!isPlainObject(world.GridCollection)) return false;
  if (!isPlainObject(world.QuestInfo)) return false;
  return true;
}

function assertNoUnsafeIntegers(text) {
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < text.length && /[0-9eE+\-.]/.test(text[j])) j++;
      const token = text.slice(i, j);
      if (!token.includes(".") && !/[eE]/.test(token)) {
        try {
          const value = BigInt(token);
          if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("The profile contains an integer outside JavaScript's safe integer range. No changes were made.");
        } catch (error) {
          if (error instanceof SyntaxError) throw new Error("The profile contains an invalid JSON number.");
          throw error;
        }
      }
      i = j - 1;
    }
  }
}

function parseProfileText(text) {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  assertNoUnsafeIntegers(normalized);
  const obj = JSON.parse(normalized);
  return isDDVProfile(obj) ? obj : null;
}

function decodeJsonBytes(bytes) {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return decoder.decode(bytes.subarray(0, end));
}

async function tryPlain(raw) {
  try {
    return parseProfileText(decoder.decode(raw));
  } catch {
    return null;
  }
}

async function tryEncrypted(raw) {
  if (raw.length % 16 !== 0) return null;
  try {
    const decrypted = aes256EcbDecrypt(raw, key);
    const jsonBytes = await readZipEntry(decrypted, ZIP_INNER_NAME);
    if (!jsonBytes) return null;
    return parseProfileText(decodeJsonBytes(jsonBytes));
  } catch {
    return null;
  }
}

export async function loadProfile(raw) {
  const plain = await tryPlain(raw);
  if (plain) return { profile: plain, inputType: "plain" };
  const encrypted = await tryEncrypted(raw);
  if (encrypted) return { profile: encrypted, inputType: "encrypted" };
  throw new Error("This file could not be validated as a DDV profile.");
}

export function validateProfileVersion(profile) {
  const version = profile?.GameInfo?.Version;
  if (!Number.isInteger(version)) throw new Error("GameInfo.Version could not be read.");
  if (version < MIN_SUPPORTED_PROFILE_VERSION) throw new Error(`This profile is older than the supported minimum. DDV v1.24.1 or later is required. GameInfo.Version: ${version}`);
  return version;
}

export async function encryptProfile(profile) {
  const jsonBytes = encoder.encode(JSON.stringify(profile));
  const zipBytes = await createZipEntry(ZIP_INNER_NAME, jsonBytes);
  return aes256EcbEncrypt(zipBytes, key);
}

export async function decryptGeneratedProfile(raw) {
  const profile = await tryEncrypted(raw);
  if (!profile) throw new Error("The generated encrypted profile could not be validated.");
  return profile;
}

export { isDDVProfile };
