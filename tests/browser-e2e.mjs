import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
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
  ".css": "text/css; charset=utf-8"
};

function sample() {
  return {
    GameInfo: { InitialVersion: 591, Version: 626, ProfileUID: "puid_browser_synthetic", Revision: 1 },
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

async function chooseFile(page, bytes, name = "profile.json") {
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#choose-file").click();
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
  const pageErrors = [];
  const downloads = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("download", download => downloads.push(download));
  await page.goto(origin, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#choose-file").count(), 1);
  assert.equal(await page.locator("#choose-file-global").count(), 1);
  assert.equal(await page.locator("#choose-file-global").isVisible(), true);
  assert.equal(await page.locator("#global-drop-overlay").count(), 1);
  assert.equal(await page.locator(".support-badge").textContent(), "v1.26.1+");
  assert.equal(await page.locator("#dlc-list li").count(), 5);
  assert.equal(await page.locator("#patch-button").count(), 0);
  const firstDownload = page.waitForEvent("download", { timeout: 20000 });
  await chooseFile(page, raw);
  const downloaded = await firstDownload;
  await awaitTitle(page, "Patched");
  assert.equal(await page.locator("#choose-file-global").isVisible(), true);
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
  await awaitTitle(page, "Already fully patched");
  assert.equal(await page.locator("#download-again").isVisible(), false);
  await page.waitForTimeout(600);
  assert.equal(downloads.length, downloadCount);
  await page.locator("#reset-file").click();
  const droppedDownload = page.waitForEvent("download", { timeout: 20000 });
  await dropFile(page, raw);
  assert.equal((await droppedDownload).suggestedFilename(), "profile.json");
  await awaitTitle(page, "Patched");
  const afterDropDownloads = downloads.length;
  await page.locator("#reset-file").click();
  await chooseFile(page, new TextEncoder().encode("invalid profile"), "bad.json");
  await page.locator("#inline-error").waitFor({ state: "visible" });
  await page.waitForTimeout(600);
  assert.equal(downloads.length, afterDropDownloads);
  assert.equal(await page.locator("#download-again").isVisible(), false);
  assert.equal(await page.locator("#global-drop-overlay").isVisible(), false);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(outbound, []);
  await context.close();
  process.stdout.write("Browser E2E PASS: file chooser, drag-and-drop, automatic download, fallback, no-op, malformed input, local-only network.\n");
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
