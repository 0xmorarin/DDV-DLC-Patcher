import { DLC_CATALOG } from "./config.js";
import { patchProfileBytes } from "./auto-patch.js";

const els = {
  workspace: document.getElementById("workspace-card"),
  dlcList: document.getElementById("dlc-list"),
  uploadState: document.getElementById("upload-state"),
  chooseFile: document.getElementById("choose-file"),
  dropOverlay: document.getElementById("global-drop-overlay"),
  fileInput: document.getElementById("file-input"),
  profileState: document.getElementById("profile-state"),
  resetFile: document.getElementById("reset-file"),
  progress: document.getElementById("auto-patch-progress"),
  patchResult: document.getElementById("patch-result"),
  resultTitle: document.getElementById("result-title"),
  resultNote: document.getElementById("result-note"),
  downloadAgain: document.getElementById("download-again"),
  inlineError: document.getElementById("inline-error"),
  errorTitle: document.getElementById("error-title"),
  errorMessage: document.getElementById("error-message")
};

let output = null;
let loadSerial = 0;

function renderDlcList(catalog = DLC_CATALOG) {
  els.dlcList.replaceChildren(...catalog.map(item => {
    const li = document.createElement("li");
    li.textContent = item.displayName;
    return li;
  }));
}

function hideError() {
  els.inlineError.classList.add("hidden");
  els.errorMessage.textContent = "";
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  let title = "Could not patch";
  let note = "No changes made.";
  if (message.includes("predates DDV v1.24.1")) {
    title = "Unsupported version";
    note = "Requires v1.24.1 or later.";
  } else if (message.includes("validated as a DDV profile") || message.includes("selected file is empty")) {
    title = "Invalid file";
    note = "Select a DDV profile.";
  } else if (message.includes("Drop exactly one")) {
    title = "One file only";
    note = "Drop a single profile.";
  }
  els.errorTitle.textContent = title;
  els.errorMessage.textContent = note;
  els.inlineError.classList.remove("hidden");
}

function resetAll() {
  ++loadSerial;
  output = null;
  els.fileInput.value = "";
  els.uploadState.classList.remove("hidden");
  els.profileState.classList.add("hidden");
  els.workspace.classList.remove("dragging");
  els.dropOverlay.classList.add("hidden");
  els.progress.classList.add("hidden");
  els.patchResult.classList.add("hidden");
  els.downloadAgain.classList.add("hidden");
  els.resultNote.textContent = "";
  hideError();
  renderDlcList();
}

function downloadOutput() {
  if (!output) return false;
  const blob = new Blob([output], { type: "application/octet-stream" });
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

function renderResult(result, downloadRequested) {
  const alreadyPatched = result.status === "already-patched";
  els.resultTitle.textContent = alreadyPatched ? "Already patched" : "Patched";
  els.resultNote.textContent = alreadyPatched ? "No changes needed." : downloadRequested ? "" : "Select Download Again.";
  els.downloadAgain.classList.toggle("hidden", alreadyPatched);
  els.patchResult.classList.remove("hidden");
}

async function loadFile(file) {
  resetAll();
  const requestId = loadSerial;
  if (!file) return;
  els.uploadState.classList.add("hidden");
  els.profileState.classList.remove("hidden");
  els.progress.textContent = "Processing…";
  els.progress.classList.remove("hidden");
  try {
    if (file.size === 0) throw new Error("The selected file is empty.");
    const raw = new Uint8Array(await file.arrayBuffer());
    if (requestId !== loadSerial) return;
    const result = await patchProfileBytes(raw);
    if (requestId !== loadSerial) return;
    renderDlcList(result.catalog);
    output = result.output;
    els.progress.classList.add("hidden");
    let downloadRequested = false;
    if (result.status === "patched") {
      try {
        downloadRequested = downloadOutput();
      } catch {}
    }
    renderResult(result, downloadRequested);
  } catch (error) {
    if (requestId !== loadSerial) return;
    output = null;
    els.progress.classList.add("hidden");
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
els.fileInput.addEventListener("change", () => {
  void loadFile(els.fileInput.files?.[0]);
});

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
    showError(new Error("Drop exactly one DDV profile file."));
    return;
  }
  void loadFile(event.dataTransfer.files[0]);
});
window.addEventListener("blur", clearDragState);
els.resetFile.addEventListener("click", resetAll);
els.downloadAgain.addEventListener("click", () => {
  try {
    downloadOutput();
  } catch (error) {
    showError(error);
  }
});
renderDlcList();
