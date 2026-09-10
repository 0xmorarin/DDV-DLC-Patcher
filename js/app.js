import { DLC_CATALOG, PLATFORM_MODES } from "./config.js";
import { decryptGeneratedProfile, encryptProfile, loadProfile, validateProfileVersion } from "./profile.js";
import { applyPatchPlan, buildPatchPlan, summarizePlan } from "./ownership.js";
import { protectedFingerprint, validatePatchedProfile, validateRoundTrip } from "./validator.js";

const els = {
  dlcList: document.getElementById("dlc-list"),
  dropZone: document.getElementById("drop-zone"),
  chooseFile: document.getElementById("choose-file"),
  fileInput: document.getElementById("file-input"),
  profileCard: document.getElementById("profile-card"),
  profileName: document.getElementById("profile-name"),
  inputType: document.getElementById("input-type"),
  profileVersion: document.getElementById("profile-version"),
  profileStatus: document.getElementById("profile-status"),
  resetFile: document.getElementById("reset-file"),
  patchButton: document.getElementById("patch-button"),
  resultCard: document.getElementById("result-card"),
  resultStatus: document.getElementById("result-status"),
  resultDetails: document.getElementById("result-details"),
  downloadButton: document.getElementById("download-button"),
  errorCard: document.getElementById("error-card"),
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

function selectedMode() {
  return document.querySelector('input[name="platform"]:checked')?.value ?? "switch";
}

function selectedPlatforms() {
  const mode = selectedMode();
  const platforms = PLATFORM_MODES[mode];
  if (!platforms) throw new Error("Invalid platform selection.");
  return platforms;
}

function targetLabel() {
  const mode = selectedMode();
  if (mode === "switch") return "Nintendo Switch";
  if (mode === "steam") return "Steam";
  return "Nintendo Switch + Steam";
}

function resetResult() {
  state.output = null;
  els.resultCard.classList.add("hidden");
  els.downloadButton.classList.add("hidden");
  els.resultDetails.replaceChildren();
}

function hideError() {
  els.errorCard.classList.add("hidden");
  els.errorMessage.textContent = "";
}

function showError(error) {
  resetResult();
  els.errorMessage.textContent = error instanceof Error ? error.message : String(error);
  els.errorCard.classList.remove("hidden");
}

function resetAll() {
  state = { file: null, profile: null, inputType: null, output: null };
  els.fileInput.value = "";
  els.profileCard.classList.add("hidden");
  hideError();
  resetResult();
  const defaultRadio = document.querySelector('input[name="platform"][value="switch"]');
  if (defaultRadio) defaultRadio.checked = true;
}

async function loadFile(file) {
  resetAll();
  hideError();
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
    els.inputType.textContent = loaded.inputType === "plain" ? "Decrypted JSON profile" : "Encrypted DDV profile";
    els.profileVersion.textContent = String(version);
    els.profileStatus.textContent = "Compatible";
    els.profileCard.classList.remove("hidden");
  } catch (error) {
    showError(error);
  }
}

function makeGroup(title, items) {
  const group = document.createElement("div");
  group.className = "result-group";
  const heading = document.createElement("h3");
  heading.textContent = title;
  group.appendChild(heading);
  const list = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
  group.appendChild(list);
  return group;
}

function renderResult(plan, platforms, totalAdded) {
  const summary = summarizePlan(plan, platforms);
  els.resultDetails.replaceChildren();
  if (totalAdded === 0) {
    els.resultStatus.className = "result-status neutral";
    els.resultStatus.textContent = `No changes needed for ${targetLabel()}. All target DLC ownership records are already present.`;
    els.resultDetails.appendChild(makeGroup("DLC ownership already present", DLC_CATALOG.map(item => item.displayName)));
    els.downloadButton.classList.add("hidden");
  } else {
    els.resultStatus.className = "result-status success";
    els.resultStatus.textContent = `Patch complete for ${targetLabel()}.`;
    const added = summary.filter(item => item.sources.length).map(item => `${item.name} — ${item.sources.join(", ")}`);
    const existing = summary.filter(item => item.sources.length === 0).map(item => item.name);
    if (added.length) els.resultDetails.appendChild(makeGroup("Ownership records added", added));
    if (existing.length) els.resultDetails.appendChild(makeGroup("Already present", existing));
    els.resultDetails.appendChild(makeGroup("Validation", ["Existing ownership data preserved", "Unselected platforms unchanged", "Unrelated profile data unchanged", "Encryption round-trip verified"]));
    els.downloadButton.classList.remove("hidden");
  }
  els.resultCard.classList.remove("hidden");
}

async function patchCurrentProfile() {
  hideError();
  resetResult();
  if (!state.profile) return;
  const buttonText = els.patchButton.textContent;
  els.patchButton.disabled = true;
  els.patchButton.textContent = "Patching…";
  try {
    const platforms = selectedPlatforms();
    const before = structuredClone(state.profile);
    const protectedHash = await protectedFingerprint(before);
    const plan = buildPatchPlan(before, platforms);
    const totalAdded = plan.anyPlatform.length + Object.values(plan.platforms).reduce((sum, value) => sum + value.additions.length, 0);
    if (totalAdded === 0) {
      renderResult(plan, platforms, 0);
      return;
    }
    const patched = structuredClone(before);
    applyPatchPlan(patched, plan);
    await validatePatchedProfile(before, patched, platforms, plan, protectedHash);
    const encrypted = await encryptProfile(patched);
    const decoded = await decryptGeneratedProfile(encrypted);
    await validateRoundTrip(patched, decoded, before, platforms, plan, protectedHash);
    state.output = encrypted;
    renderResult(plan, platforms, totalAdded);
  } catch (error) {
    showError(error);
  } finally {
    els.patchButton.disabled = false;
    els.patchButton.textContent = buttonText;
  }
}

function downloadOutput() {
  if (!state.output) return;
  const blob = new Blob([state.output], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "profile";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

els.chooseFile.addEventListener("click", event => {
  event.stopPropagation();
  els.fileInput.click();
});
els.dropZone.addEventListener("click", event => {
  if (event.target !== els.chooseFile) els.fileInput.click();
});
els.dropZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.fileInput.click();
  }
});
els.fileInput.addEventListener("change", () => loadFile(els.fileInput.files?.[0]));
for (const eventName of ["dragenter", "dragover"]) els.dropZone.addEventListener(eventName, event => {
  event.preventDefault();
  els.dropZone.classList.add("dragging");
});
for (const eventName of ["dragleave", "drop"]) els.dropZone.addEventListener(eventName, event => {
  event.preventDefault();
  els.dropZone.classList.remove("dragging");
});
els.dropZone.addEventListener("drop", event => loadFile(event.dataTransfer?.files?.[0]));
els.resetFile.addEventListener("click", resetAll);
els.patchButton.addEventListener("click", patchCurrentProfile);
els.downloadButton.addEventListener("click", downloadOutput);
document.querySelectorAll('input[name="platform"]').forEach(input => input.addEventListener("change", resetResult));
renderDlcList();
