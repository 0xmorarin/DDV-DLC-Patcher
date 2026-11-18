import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { patchProfileBytes } from "../js/auto-patch.js";
import { decryptGeneratedProfile, encryptProfile } from "../js/profile.js";
import { AUTO_PATCH_PLATFORMS, DLC_CATALOG } from "../js/config.js";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sample() {
  return {
    GameInfo: { InitialVersion: 591, Version: 643, ProfileUID: "puid_browser_synthetic", Revision: 1 },
    Player: { Name: "Browser fixture", ContainerInventories: {}, CurrencyAmounts: {}, Cookbook: {} },
    World: { Villages: [], Characters: [], GridCollection: {}, QuestInfo: {} },
    LastKnownBoughtExpansionsAnyPlatform: ["SyntheticUnknownExpansion"],
    ExpansionPackOwnershipByPlatform: {
      Nintendo: { Entries: [{ PackName: "SyntheticUnrelated_Nintendo", PackType: "Other", Type: "Preserved" }] },
      Steam: { Entries: [] },
      AppleArcade: { Entries: [{ PackName: "SyntheticArcadeRecord", PackType: "Other", Type: "Preserved" }] }
    },
    PrivateSyntheticField: { preserved: true }
  };
}

async function listen() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const path = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
      if (path !== root && !path.startsWith(root + "/")) {
        response.writeHead(403);
        response.end();
        return;
      }
      const data = await readFile(path);
      response.setHeader("Content-Type", contentTypes[extname(path)] ?? "application/octet-stream");
      response.writeHead(200);
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise(resolveReady => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  return { server, origin: "http://127.0.0.1:" + address.port };
}

async function awaitTitle(page, title) {
  await page.waitForFunction(expected =>
    document.getElementById("result-title")?.textContent === expected &&
    !document.getElementById("patch-result")?.classList.contains("hidden"), title);
}

async function chooseFile(page, bytes, name = "profile.json", selector = "#choose-file") {
  const chooser = page.waitForEvent("filechooser");
  await page.locator(selector).click();
  const fileChooser = await chooser;
  await fileChooser.setFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(bytes)
  });
}

async function dropFile(page, bytes) {
  await page.evaluate(data => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(data)], "profile.json", { type: "application/octet-stream" }));
    document.body.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    if (document.getElementById("global-drop-overlay").classList.contains("hidden")) throw new Error("Full-screen drop overlay did not appear.");
    document.body.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
    document.body.dispatchEvent(event);
  }, Array.from(bytes));
}

const { server, origin } = await listen();
let browser;
try {
  const before = sample();
  const raw = await encryptProfile(before);
  const prepatched = await patchProfileBytes(raw);
  assert.equal(prepatched.status, "patched");
  const complete = prepatched.output;
  browser = await chromium.launch({ headless: true, ...(process.env.CI ? { channel: "chrome" } : {}) });
  const context = await browser.newContext({ acceptDownloads: true });
  const outbound = [];
  await context.route("**/*", route => {
    if (route.request().url().startsWith(origin + "/")) return route.continue();
    outbound.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const pageErrors = [];
  const downloads = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("download", download => downloads.push(download));
  await page.goto(origin, { waitUntil: "networkidle" });
  assert.equal(await page.locator(".royal-seal").count(), 0);
  assert.equal(await page.locator(".ornament-divider").count(), 0);
  assert.equal(await page.locator(".simple-divider").count(), 1);
  assert.equal(await page.locator(".royal-corners").count(), 0);
  assert.equal(await page.locator("#status-mark").count(), 0);
  assert.equal(await page.locator(".drop-symbol svg path").count(), 3);
  assert.equal(await page.locator(".card").count(), 1);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  assert.match(background, /royal-nebula\.svg/);
  const nebula = await page.request.get(origin + "/assets/royal-nebula.svg");
  assert.equal(nebula.status(), 200);
  const nebulaMarkup = await nebula.text();
  assert.ok(nebulaMarkup.includes('feTurbulence'));
  assert.ok(!nebulaMarkup.includes("<pattern"));
  await page.evaluate(async () => {
    const img = new Image();
    img.src = "./assets/royal-nebula.svg";
    await img.decode();
  });
  await mkdir("ui-preview", { recursive: true });
  await page.screenshot({ path: "ui-preview/royal-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "ui-preview/royal-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.locator("#choose-file").count(), 1);
  assert.equal(await page.locator(".card").count(), 1);
  assert.equal(await page.locator(".profile-details").count(), 0);
  assert.equal(await page.locator("#result-list").count(), 0);
  assert.equal(await page.locator("#result-platform").count(), 0);
  assert.equal(await page.locator(".version-scope").count(), 0);
  assert.equal(await page.locator(".platform-scope").count(), 0);
  assert.equal(await page.locator("#global-drop-overlay").count(), 1);
  assert.equal(await page.locator(".support-badge").textContent(), "v1.26.1+");
  assert.equal(await page.locator("#dlc-list li").count(), 5);
  assert.equal(await page.locator("#patch-button").count(), 0);
  const firstDownload = page.waitForEvent("download", { timeout: 20000 });
  await chooseFile(page, raw);
  const downloaded = await firstDownload;
  await awaitTitle(page, "Patched");
  assert.equal(await page.locator("#reset-file").isVisible(), true);
  assert.equal(await page.locator("#result-title").textContent(), "Patched");
  assert.equal(await page.locator("#patch-result .status-mark").count(), 0);
  assert.equal(await page.locator("#result-note").textContent(), "");
  assert.equal(downloaded.suggestedFilename(), "profile.json");
  const patched = await decryptGeneratedProfile(new Uint8Array(await readFile(await downloaded.path())));
  assert.ok(DLC_CATALOG.every(item => patched.LastKnownBoughtExpansionsAnyPlatform.includes(item.anyPlatformId)));
  for (const platform of AUTO_PATCH_PLATFORMS) {
    for (const item of DLC_CATALOG) {
      assert.ok(patched.ExpansionPackOwnershipByPlatform[platform].Entries.some(entry =>
        entry.PackName === item.entitlements[platform].PackName));
    }
  }
  assert.deepEqual(patched.ExpansionPackOwnershipByPlatform.AppleArcade,
    before.ExpansionPackOwnershipByPlatform.AppleArcade);
  assert.deepEqual(patched.PrivateSyntheticField, before.PrivateSyntheticField);
  const againDownload = page.waitForEvent("download", { timeout: 10000 });
  await page.locator("#download-again").click();
  assert.equal((await againDownload).suggestedFilename(), "profile.json");
  const downloadCount = downloads.length;
  await page.locator("#reset-file").click();
  await chooseFile(page, complete);
  await awaitTitle(page, "Already patched");
  assert.equal(await page.locator("#download-again").isVisible(), false);
  await page.waitForTimeout(600);
  assert.equal(downloads.length, downloadCount);
  const persistentChooserDownload = page.waitForEvent("download", { timeout: 20000 });
  await page.locator("#reset-file").click();
  await chooseFile(page, raw);
  assert.equal((await persistentChooserDownload).suggestedFilename(), "profile.json");
  await awaitTitle(page, "Patched");
  await page.locator("#reset-file").click();
  const droppedDownload = page.waitForEvent("download", { timeout: 20000 });
  await dropFile(page, raw);
  assert.equal((await droppedDownload).suggestedFilename(), "profile.json");
  await awaitTitle(page, "Patched");
  const afterDropDownloads = downloads.length;
  await page.locator("#reset-file").click();
  await chooseFile(page, new TextEncoder().encode("invalid profile"), "bad.json");
  await page.locator("#inline-error").waitFor({ state: "visible" });
  assert.equal(await page.locator("#error-title").textContent(), "Invalid file");
  await page.waitForTimeout(600);
  assert.equal(downloads.length, afterDropDownloads);
  assert.equal(await page.locator("#download-again").isVisible(), false);
  assert.equal(await page.locator("#global-drop-overlay").isVisible(), false);
  await page.locator("#reset-file").click();
  const legacy = sample();
  legacy.GameInfo.Version = 626;
  const legacyDownload = page.waitForEvent("download", { timeout: 20000 });
  await chooseFile(page, await encryptProfile(legacy));
  const historical = await legacyDownload;
  await awaitTitle(page, "Patched");
  assert.equal(await page.locator("#dlc-list li").count(), 4);
  assert.equal(await page.locator(".support-badge").textContent(), "v1.26.1+");
  assert.equal(await page.locator("#result-list").count(), 0);
  assert.equal((await page.locator("#dlc-list").textContent()).includes("The Keepsake Sea"), false);
  const legacyOutput = await decryptGeneratedProfile(new Uint8Array(await readFile(await historical.path())));
  assert.equal(legacyOutput.LastKnownBoughtExpansionsAnyPlatform.includes("Expansion04"), false);
  assert.equal(legacyOutput.ExpansionPackOwnershipByPlatform.Nintendo.Entries.some(entry =>
    entry.PackName === DLC_CATALOG[4].entitlements.Nintendo.PackName), false);
  await page.locator("#reset-file").click();
  assert.equal(await page.locator("#dlc-list li").count(), 5);
  const legacyDownloads = downloads.length;
  const tooOld = sample();
  tooOld.GameInfo.Version = 590;
  await chooseFile(page, await encryptProfile(tooOld));
  await page.locator("#inline-error").waitFor({ state: "visible" });
  assert.equal(await page.locator("#error-title").textContent(), "Unsupported version");
  assert.equal(await page.locator("#error-message").textContent(), "Requires v1.24.1 or later.");
  await page.waitForTimeout(600);
  assert.equal(downloads.length, legacyDownloads);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(outbound, []);
  await context.close();
  process.stdout.write("Browser E2E PASS: file chooser, drag-and-drop, automatic download, fallback, no-op, malformed input, local-only network.\n");
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
