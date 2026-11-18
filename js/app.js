import { DLC_CATALOG } from "./config.js";
import { patchProfileBytes } from "./auto-patch.js";
import { summarizePlan } from "./ownership.js";

const els = {
  workspace: document.getElementById("workspace-card"),
  dlcList: document.getElementById("dlc-list"),
  uploadState: document.getElementById("upload-state"),
  chooseFile: document.getElementById("choose-file"),
  chooseFileGlobal: document.getElementById("choose-file-global"),
  dropOverlay: document.getElementById("global-drop-overlay"),
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
  progress: document.getElementById("auto-patch-progress"),
  patchResult: document.getElementById("patch-result"),
  resultTitle: document.getElementById("result-title"),
  resultPlatform: document.getElementById("result-platform"),
  resultList: document.getElementById("result-list"),
  resultNote: document.getElementById("result-note"),
  downloadAgain: document.getElementById("download-again"),
  inlineError: document.getElementById("inline-error"),
  errorMessage: document.getElementById("error-message")
};

let state = { output: null };
let loadSerial = 0;

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

function hideError() {
  els.inlineError.classList.add("hidden");
  els.errorMessage.textContent = "";
}

function showError(error) {
  els.inlineError.classList.remove("hidden");
  els.errorMessage.textContent = error instanceof Error ? error.message : String(error);
}

function resetPatchState() {
  state.output = null;
  els.patchResult.classList.add("hidden");
  els.downloadAgain.classList.add("hidden");
  els.progress.classList.add("hidden");
  els.resultList.replaceChildren();
  els.resultPlatform.textContent = "";
  els.resultNote.textContent = "";
  hideError();
}

function resetAll() {
  ++loadSerial;
  state = { output: null };
  els.fileInput.value = "";
  els.uploadState.classList.remove("hidden");
  els.profileState.classList.add("hidden");
  els.workspace.classList.remove("dragging");
  els.dropOverlay.classList.add("hidden");
  resetPatchState();
}

function setProgress(message) {
  els.progress.textContent = message;
  els.progress.classList.remove("hidden");
}

function platformLabel(platform) {
  return platform === "Nintendo" ? "Nintendo Switch" : platform;
}

function createResultItem(name, status) {
  const item = document.createElement("div");
  item.className = "result-item";
  const label = document.createElement("span");
  label.className = "result-name";
  label.textContent = name;
  const result = document.createElement("span");
  result.className = `result-badge${status === "Already present" ? " existing" : ""}`;
  result.textContent = status;
  item.append(label, result);
  return item;
}

function renderResult(result, automaticDownloadRequested) {
  const { plan, platforms, totalAdded, status } = result;
  const summary = summarizePlan(plan, platforms);
  els.resultList.replaceChildren(...summary.map(item =>
    createResultItem(item.name, item.sources.length ? "Added" : "Already present")));
  els.resultPlatform.textContent = `Target platforms: ${platforms.map(platformLabel).join(" + ")}`;
  if (status === "already-patched") {
    els.resultTitle.textContent = "Already fully patched";
    els.resultNote.textContent = "Every supported DLC entry already exists for all six standard storefront groups. Existing records were preserved and no file was downloaded.";
    els.downloadAgain.classList.add("hidden");
  } else {
    els.resultTitle.textContent = "Patched";
    els.resultNote.textContent = automaticDownloadRequested
      ? `Added ${totalAdded} missing ownership identifiers without changing existing records. Automatic download requested. If your browser blocked it, select Download Again.`
      : "Patch validated, but the automatic download could not be started. Select Download Again.";
    els.downloadAgain.classList.remove("hidden");
  }
  els.patchResult.classList.remove("hidden");
}

function downloadOutput() {
  if (!state.output) return false;
  const blob = new Blob([state.output], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "profile.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function loadFile(file) {
  resetAll();
  const requestId = loadSerial;
  if (!file) return;

  els.fileInput.value = "";
  els.uploadState.classList.add("hidden");
  els.profileState.classList.remove("hidden");
  els.profileName.textContent = file.name || "profile";
  els.inputType.textContent = "Checking file";
  els.profileVersion.textContent = "—";
  els.profileStatus.textContent = "Processing";
  renderProfileDetails(null);
  setProgress("Reading and validating your DDV profile…");

  try {
    if (file.size === 0) throw new Error("The selected file is empty.");
    const raw = new Uint8Array(await file.arrayBuffer());
    if (requestId !== loadSerial) return;
    setProgress("Applying missing expansion ownership records and validating the result…");
    const result = await patchProfileBytes(raw);
    if (requestId !== loadSerial) return;

    els.inputType.textContent = result.inputType === "plain" ? "Decrypted JSON" : "Encrypted profile";
    els.profileVersion.textContent = String(result.version);
    renderProfileDetails(result.profile);
    els.profileStatus.textContent = result.status === "already-patched" ? "Already patched" : "Complete";
    els.progress.classList.add("hidden");
    state.output = result.output;

    let downloaded = false;
    if (result.status === "patched") {
      try { downloaded = downloadOutput(); } catch {}
    }
    renderResult(result, downloaded);
  } catch (error) {
    if (requestId !== loadSerial) return;
    els.progress.classList.add("hidden");
    els.profileStatus.textContent = "Error";
    state.output = null;
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
els.fileInput.addEventListener("change", () => { void loadFile(els.fileInput.files?.[0]); });

els.chooseFileGlobal.addEventListener("click", () => els.fileInput.click());

let dragDepth = 0;

function isFileDrag(event) {
  return !!event.dataTransfer?.types && Array.from(event.dataTransfer.types).includes("Files");
}

function clearDragState() {
  dragDepth = 0;
  els.dropOverlay.classList.add("hidden");
  els.workspace.classList.remove("dragging");
}

document.addEventListener("dragenter", event => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth++;
  els.dropOverlay.classList.remove("hidden");
  els.workspace.classList.add("dragging");
});
document.addEventListener("dragover", event => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  els.dropOverlay.classList.remove("hidden");
});
document.addEventListener("dragleave", event => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) clearDragState();
});
document.addEventListener("drop", event => {
  if (!isFileDrag(event) && !event.dataTransfer?.files?.length) return;
  event.preventDefault();
  clearDragState();
  if (event.dataTransfer?.files?.length !== 1) {
    resetAll();
    els.uploadState.classList.add("hidden");
    els.profileState.classList.remove("hidden");
    els.profileStatus.textContent = "Error";
    showError(new Error("Drop exactly one DDV profile file."));
    return;
  }
  void loadFile(event.dataTransfer.files[0]);
});
window.addEventListener("blur", clearDragState);
els.resetFile.addEventListener("click", resetAll);
els.downloadAgain.addEventListener("click", () => {
  try { downloadOutput(); } catch (error) { showError(error); }
});
renderDlcList();
