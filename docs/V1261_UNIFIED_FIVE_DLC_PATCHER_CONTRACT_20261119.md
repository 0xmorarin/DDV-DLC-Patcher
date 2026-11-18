# v1.24.1+ unified DLC Patcher — version-dependent four/five-DLC implementation

**Implementation status: MIN_591 / FOUR_DLC_UNTIL_642 / FIVE_DLC_FROM_643 / SIX_STANDARD_STOREFRONTS / AUTOMATED_TESTS / DEVICE_ONLY_NINTENDO_STEAM.**

This is the current implementation contract. Earlier November 18 preflight documents and any notes about a four-pass catalog or profile-version write ceiling describe superseded intermediate states.

## Source identity and exact evidence

The genuine v1.26.1 originals were inspected during the native-static research. The source-specific forensic record is [NATIVE_SIX_STORE_OWNERSHIP_PROOF_V1_26_1_20261119.md](./NATIVE_SIX_STORE_OWNERSHIP_PROOF_V1_26_1_20261119.md).

- Switch original NSO SHA-256: `3e127d189106162c939f3afbaa4d7de12cd0e15277c9b2e7a4a912faed0d67ba`.
- Full original Switch Build ID: `3346726B2F640E01EF664D98EB2CF5A0`; Atmosphère prefix: `3346726B2F640E01`.
- RomFS `protoDb.bin` SHA-256: `dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623`; 53 IAP definitions and seven StoreFrontGroups.
- Actual game's `FullVersion.txt`: `releases_1.26ex-v1.26.1-633-g45e7ee77d30a-incremental-18`.
- Switch private backed-up `profile` size 13,835,084 bytes and SHA-256 `d1de0223a37b0cd245c2185b0ed0c12f2f01937c52f8528636b33de76da38fe1`; `GameInfo.Version=643`, `InitialVersion=518`. Actual JSON object has `GameInfo`, `Player`, `World`, `LastKnownBoughtExpansionsAnyPlatform`, `ExpansionPackOwnershipByPlatform` of the required shape.
- Real v643 ownership map keys: `Nintendo` and `Steam`. Nintendo has five original pass records and a distinct new Deluxe-edition record; Steam has the four prior pass records only. Both are preserved by design. Raw private profile is not committed.

The native v1.26.1 AArch64 path traces `StoreFrontGroup.SetCurrentStoreOrigin` → current group `UniqueName` → `Profile.ExpansionPackOwnershipByPlatform` lookup/insertion keyed by that group name. `IAPData.get_KeyFriendlyId` assembles `IAPData.UniqueName + "_" + StoreFrontGroup.UniqueName + "_OnlineKey"`. Both separators were extracted from the actual literal table, not inferred. The original IAP and purchased-status field mapping establishes `PackType=ExpansionPack` and `Type=Type_Purchased` for newly inserted pass records.

## Active catalog

| Displayed DLC | Any-platform ID | Pass IAP UniqueName |
|---|---|---|
| A Rift in Time | `Expansion01` | `Expansion1PackExpansionPass` |
| The Storybook Vale | `Expansion02` | `Expansion2PackExpansionPass` |
| Wishblossom Ranch | `Expansion03` | `Expansion3PackExpansionPass` |
| Honeyglow Woods | `WinnieDLC` | `MiniExpansion1PackExpansionPass` |
| The Keepsake Sea | `Expansion04` | `Expansion4PackExpansionPass` |

Each IAP has product coverage for the six normal groups: `Nintendo`, `Steam`, `Epic`, `Microsoft`, `Sony`, `Apple` (standard Mac App Store). The shared logical Profile contains six string-keyed ownership sets. `AppleArcade` is excluded, even though it has a distinct `StoreFrontGroup` in protoDb. Edition/Deluxe/Ultimate, premium currency and unrelated ownership records are never synthesized.

The new `Expansion4PackExpansionPass` row itself has an empty `AssociatedExpansion` field; the `Expansion4PackDeluxeEdition` row has `AssociatedExpansion=Expansion04`. The precise any-platform ID also appears in the genuine v643 Switch save. Do not misattribute the identifier to a nonempty field in the pass IAP.

## Version policy

**Minimum supported public release: v1.24.1, observed save `GameInfo.Version=591`.** Saves with a lower internal version are rejected even if their JSON fields superficially match. There is **no upper version cap**; future profiles must pass structural, numeric and format checks.

| Save `GameInfo.Version` | Catalog applied | Source basis |
|---|---|---|
| Below 591 | Rejected | Original minimum v1.24.1 requirement |
| 591–626 | Four existing DLCs | v1.24.1 baseline and observed v1.25.3 save at 626 |
| 627–642 | Four existing DLCs, conservatively | No individually verified public build mapping for this gap; do not introduce fifth-pass data |
| 643 and above | Five DLCs including The Keepsake Sea | Actual v1.26.1 v643 source save, protoDb and native trace |

`GameInfo.InitialVersion` is **not** the selection key. A profile created in an older version but saved by v1.26.1 can have `InitialVersion=518` and `Version=643`; it must use five DLCs.

The UI displays **v1.24.1+** as the overall support range, shows the two catalog ranges and labels The Keepsake Sea as requiring v1.26.1+. Before loading, it lists all possible DLCs with the limitation; after loading it shows precisely the selected four or five. `GameInfo.Version` is never modified by the patcher.

This release-name-to-save-counter mapping is source-grounded at the known endpoints, not asserted for every intermediate integer. When later build evidence arrives, update the mapping if required rather than guessing. A future build with an incompatible Profile schema fails the normal structural/round-trip checks.

## Strict insert-only semantics

- Never replace, normalize, reorder internally, remove or edit an existing `ExpansionPackOwnershipByPlatform[store].Entries` object or an existing any-platform array element.
- For each DLC, add its any-platform ID only when the exact ID is absent.
- For each target store and DLC, add the expected `PackName` record only when no existing record with that exact `PackName` is present. A pre-existing record with a different `PackType` or `Type` remains untouched and is not duplicated.
- Existing unknown, Arcade, Deluxe and unrelated records stay in their original relative order; new records are inserted in catalog order without changing the values of existing elements.
- The pipeline verifies ownership-only additions against the original, hashes the remainder of the Profile, and requires an encrypted save round trip before offering output.
- If no IDs or records are missing in the selected six groups, show a no-op result and **do not create or download a file**.
- Invalid profile structure, unsupported transport or ambiguous node types are rejected without downloading output. The source file is never modified.

This makes the tool a *local save-data marker editor*. It does not grant marketplace purchases, guarantee online entitlements or promise cross-buy.

## User experience

**One unified card, minimum copy.** The previous separate hero and workspace cards were merged into one responsive card. The two long release-range and storefront paragraphs were removed entirely, as were the player/account/created/modified/play-time/device details and the platform-by-platform/DLC-by-DLC patch report. The compact DLC name list remains, with four or five names depending on the validated save version; The Keepsake Sea carries a short `v1.26.1+` suffix. The version badge still reads `v1.24.1+`.

A file can be dropped anywhere on the page or chosen with the **Choose File** button. Patch/download begins automatically. The outcome is limited to `Patched`, `Already patched`, `Unsupported version`, `Invalid file` or an exceptional `Could not patch` status with a brief explanation. `Download Again` remains available only after successful output creation, and **Choose another file** resets the card. No counts, personal profile fields, individual DLC additions or selectable platform options appear. A concise offline-only caution remains.

The full-screen drag overlay, local processing and zero external requests remain unchanged. The version minimum and the four-versus-five DLC rules live in the patch engine; the presentation does not choose entitlement rules.

## Verification status and limitations

- GitHub CI includes the original v1.25.3 Steam626 observed-key projection and the v1.26.1 real-profile-derived redacted 643 fixture.
- Node tests cover the v1.24.1 minimum, four-to-five DLC switch at save version 643, all six storefronts, missing and preexisting records, protected data, no-op, wrong structure, forward schema compatibility, encrypted round-trip, and preservation.
- Playwright Chromium E2E covers full-page drag-and-drop with overlay, file chooser, auto-download and Download Again, invalid-file no output, no-op no download and no outbound requests.
- Genuine v1.26.1 original JSON source shape and entitlement fields are independently observed; **the browser tests use synthetic profiles**, not the original private file.
- **Four non-Switch/Steam platforms are static-evidence only.** Their distinct native binaries, real platform containers, store-service behavior and live in-game reload/sync have not been run. These are disclosed limitations, not universal mandatory blockers for the owner's static-acceptance policy.
- No direct modification of `main`, no unrequested release or merge. Publication remains a separate decision after reviewing the exact PR HEAD and acceptance record.

For the next update, re-check the original Build ID, IAP product definitions, StoreFrontGroup origin mapping and Profile structure. Retain the v1.24.1 minimum and source-backed DLC cutover; do not impose an arbitrary future-version ceiling while the schema remains compatible.


## Local owner UI preview

Download the tested source archive from the GitHub Actions `browser` job, extract it, and run `preview-local.cmd` on Windows (requires Node.js installed), or execute `npm run preview` in the extracted directory. The preview uses only `127.0.0.1:8765`; it does not require installation of dependencies or access to the game. Open `http://127.0.0.1:8765/` and drop a backed-up profile anywhere on the page. Alternatively `py -3 -m http.server 8765 --bind 127.0.0.1` can serve the same static files.

The browser's encrypted output download is a new local `profile.json`; original source files are not edited. Use expendable backups and stop the local server when inspection is done. Only the user can judge the visual UI appearance and actual game reload; browser E2E is an automated behavioral test, not visual acceptance.
