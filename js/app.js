import { DLC_CATALOG, PLATFORM_MODES } from "./config.js";
import { decryptGeneratedProfile, encryptProfile, loadProfile, validateProfileVersion } from "./profile.js";
import { applyPatchPlan, buildPatchPlan, summarizePlan } from "./ownership.js";
import { protectedFingerprint, validatePatchedProfile, validateRoundTrip } from "./validator.js";

const els = {
  dlcList: document.getElementById("dlc-list"),
  uploadState: document.getElementById("upload-state"),
  chooseFile: document.getElementById("choose-file"),
  fileInput: document.getElementById("file-input"),
  profileState: document.getElementById("profile-state"),
  profileName: document.getElementById("profile-name"),
  inputType: document.getElementById("input-type"),
  profileVersion: document.getElementById("profile-version"),
  profileStatus: document.getElementById("profile-status"),
  playerName: document.getElementById("player-name"),
  ingameId: document.getElementById("ingame-id"),
  profileCreated: document.getElementById("profile-created"),
  profileModified: document.getElementById("profile-modified"),
  playTime: document.getElementById("play-time"),
  saveDevice: document.getElementById("save-device"),
  resetFile: document.getElementById("reset-file"),
  patchButton: document.getElementById("patch-button"),
  patchResult: document.getElementById("patch-result"),
  resultTitle: document.getElementById("result-title"),
  resultPlatform: document.getElementById("result-platform"),
  resultList: document.getElementById("result-list"),
  resultNote: document.getElementById("result-note"),
  downloadAgain: document.getElementById("download-again"),
  inlineError: document.getElementById("inline-error"),
  errorMessage: document.getElementById("error-message")
};

let state = { file: null, profile: null, inputType: null, output: null };

function renderDlcList() {
  els.dlcList.replaceChildren(...DLC_CATALOG.map(item => {
    const li = document.createElement("li");
    li.textContent = item.displayName;
    return li;
  }));
}


function formatTimestamp(value) {
  if (typeof value !== "string" || !value) return "—";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  if (!match) return value;
  return `${match[1]} ${match[2]}${value.endsWith("Z") ? " UTC" : ""}`;
}

function formatPlayTime(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return "—";
  const hours = Math.floor(value / 60);
  const mins = Math.floor(value % 60);
  return `${hours.toLocaleString()}h ${mins}m`;
}

function formatDevice(info) {
  if (!info || typeof info !== "object") return "—";
  const type = typeof info.deviceType === "string" ? info.deviceType : "";
  if (type === "DeviceType_Switch") return "Nintendo Switch";
  if (type === "DeviceType_Windows") return "Windows";
  if (type) return type.replace(/^DeviceType_/, "").replaceAll("_", " ");
  return typeof info.deviceName === "string" && info.deviceName ? info.deviceName : "—";
}

function renderProfileDetails(profile) {
  const gameInfo = profile?.GameInfo ?? {};
  const player = profile?.Player ?? {};
  els.playerName.textContent = typeof player.Name === "string" && player.Name ? player.Name : "—";
  els.ingameId.textContent = typeof gameInfo.LastCustomIdOwner === "string" && gameInfo.LastCustomIdOwner ? `mdc:${gameInfo.LastCustomIdOwner}` : "mdc:—";
  els.profileCreated.textContent = formatTimestamp(gameInfo.Created);
  els.profileModified.textContent = formatTimestamp(gameInfo.Modified);
  els.playTime.textContent = formatPlayTime(player.TimePlayedInMinutes);
  els.saveDevice.textContent = formatDevice(gameInfo.LastSaveDeviceInfo);
}

function selectedMode() {
  return document.querySelector('input[name="platform"]:checked')?.value ?? "switch";
}

function selectedPlatforms() {
  const platforms = PLATFORM_MODES[selectedMode()];
  if (!platforms) throw new Error("Invalid platform selection.");
  return platforms;
}

function targetLabel() {
  const mode = selectedMode();
  if (mode === "switch") return "Nintendo Switch";
  if (mode === "steam") return "Steam";
  return "Nintendo Switch + Steam";
}

function hideError() {
  els.inlineError.classList.add("hidden");
  els.errorMessage.textContent = "";
}

function showError(error) {
  els.errorMessage.textContent = error instanceof Error ? error.message : String(error);
  els.inlineError.classList.remove("hidden");
}

function resetPatchState() {
  state.output = null;
  els.patchResult.classList.add("hidden");
  els.downloadAgain.classList.add("hidden");
  els.resultList.replaceChildren();
  els.resultPlatform.textContent = "";
  els.resultNote.textContent = "";
  els.patchButton.classList.remove("hidden");
  els.patchButton.disabled = false;
  els.patchButton.textContent = "Patch & Download";
  hideError();
}

function resetAll() {
  state = { file: null, profile: null, inputType: null, output: null };
  els.fileInput.value = "";
  els.uploadState.classList.remove("hidden");
  els.profileState.classList.add("hidden");
  const defaultRadio = document.querySelector('input[name="platform"][value="switch"]');
  if (defaultRadio) defaultRadio.checked = true;
  resetPatchState();
}

async function loadFile(file) {
  resetAll();
  try {
    if (!file) return;
    if (file.size === 0) throw new Error("The selected file is empty.");
    const raw = new Uint8Array(await file.arrayBuffer());
    const loaded = await loadProfile(raw);
    const version = validateProfileVersion(loaded.profile);
    state.file = file;
    state.profile = loaded.profile;
    state.inputType = loaded.inputType;
    els.profileName.textContent = file.name || "profile";
    els.inputType.textContent = loaded.inputType === "plain" ? "Decrypted JSON" : "Encrypted profile";
    els.profileVersion.textContent = String(version);
    els.profileStatus.textContent = "Ready";
    renderProfileDetails(loaded.profile);
    els.uploadState.classList.add("hidden");
    els.profileState.classList.remove("hidden");
  } catch (error) {
    els.uploadState.classList.add("hidden");
    els.profileState.classList.remove("hidden");
    els.profileName.textContent = file?.name || "profile";
    els.inputType.textContent = "Unknown input";
    els.profileVersion.textContent = "—";
    els.profileStatus.textContent = "Error";
    renderProfileDetails(null);
    els.patchButton.classList.add("hidden");
    showError(error);
  }
}

function createResultItem(name, status) {
  const item = document.createElement("div");
  item.className = "result-item";
  const label = document.createElement("span");
  label.className = "result-name";
  label.textContent = name;
  const badge = document.createElement("span");
  badge.className = `result-badge${status === "Already present" ? " existing" : ""}`;
  badge.textContent = status;
  item.append(label, badge);
  return item;
}

function renderResult(plan, platforms, totalAdded, downloaded) {
  const summary = summarizePlan(plan, platforms);
  els.resultList.replaceChildren(...summary.map(item => createResultItem(item.name, item.sources.length ? "Added" : "Already present")));
  els.resultPlatform.textContent = targetLabel();
  els.patchButton.classList.add("hidden");
  if (totalAdded === 0) {
    els.resultTitle.textContent = "No changes needed";
    els.resultNote.textContent = "All supported DLC ownership records are already present for the selected platform.";
    els.downloadAgain.classList.add("hidden");
  } else {
    els.resultTitle.textContent = downloaded ? "Patched & downloaded" : "Patched";
    els.resultNote.textContent = "Validation passed · Existing ownership and unrelated save data were preserved.";
    els.downloadAgain.classList.remove("hidden");
  }
  els.patchResult.classList.remove("hidden");
}

function downloadOutput() {
  if (!state.output) return false;
  const blob = new Blob([state.output], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "profile.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

async function patchCurrentProfile() {
  hideError();
  if (!state.profile) return;
  els.patchResult.classList.add("hidden");
  els.patchButton.disabled = true;
  els.patchButton.textContent = "Patching & Downloading…";
  try {
    const platforms = selectedPlatforms();
    const before = structuredClone(state.profile);
    const protectedHash = await protectedFingerprint(before);
    const plan = buildPatchPlan(before, platforms);
    const totalAdded = plan.anyPlatform.length + Object.values(plan.platforms).reduce((sum, value) => sum + value.additions.length, 0);
    if (totalAdded === 0) {
      renderResult(plan, platforms, 0, false);
      return;
    }
    const patched = structuredClone(before);
    applyPatchPlan(patched, plan);
    await validatePatchedProfile(before, patched, platforms, plan, protectedHash);
    const encrypted = await encryptProfile(patched);
    const decoded = await decryptGeneratedProfile(encrypted);
    await validateRoundTrip(patched, decoded, before, platforms, plan, protectedHash);
    state.output = encrypted;
    const downloaded = downloadOutput();
    renderResult(plan, platforms, totalAdded, downloaded);
  } catch (error) {
    els.patchButton.disabled = false;
    els.patchButton.textContent = "Patch & Download";
    showError(error);
  }
}

els.chooseFile.addEventListener("click", event => {
  event.stopPropagation();
  els.fileInput.click();
});
els.uploadState.addEventListener("click", event => {
  if (event.target !== els.chooseFile) els.fileInput.click();
});
els.uploadState.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.fileInput.click();
  }
});
els.fileInput.addEventListener("change", () => loadFile(els.fileInput.files?.[0]));
for (const eventName of ["dragenter", "dragover"]) els.uploadState.addEventListener(eventName, event => {
  event.preventDefault();
  els.uploadState.classList.add("dragging");
});
for (const eventName of ["dragleave", "drop"]) els.uploadState.addEventListener(eventName, event => {
  event.preventDefault();
  els.uploadState.classList.remove("dragging");
});
els.uploadState.addEventListener("drop", event => loadFile(event.dataTransfer?.files?.[0]));
els.resetFile.addEventListener("click", resetAll);
els.patchButton.addEventListener("click", patchCurrentProfile);
els.downloadAgain.addEventListener("click", downloadOutput);
document.querySelectorAll('input[name="platform"]').forEach(input => input.addEventListener("change", resetPatchState));
renderDlcList();
