# v1.26.1+ unified DLC Patcher — implementation and acceptance record

**Implementation status: FIVE_DLC_SIX_STANDARD_STOREFRONTS / AUTOMATED_TESTS_PASS / DEVICE_ONLY_NINTENDO_STEAM.**

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

**No lower or upper `GameInfo.Version` gate.** A profile is eligible for processing when the reader successfully validates the known DDV logical schema, the target ownership lists/maps, safe JSON numeric representation and the supported encrypted/plain transport. The version is retained and displayed, not changed. A future version with a changed schema fails structural validation, not an arbitrary version cutoff.

The UI displays **v1.26.1+** to indicate the latest supported catalog baseline. This label is not a proof that unexamined future updates have an unchanged schema. Older profiles with the recognized structure are not rejected solely because of the version number.

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

The page shows `v1.26.1+`, auto-renders all five supported DLC titles, and describes the six normal storefronts. Files can be dropped anywhere in the browser page, not just in the central card; a full-viewport overlay indicates a file drag. A persistent **Choose File** button remains available in the heading as well as the initial drop card; a **Change File** button is available after processing. Selection or drop immediately runs the offline patch/check flow and, only when additions exist and verification completes, starts a local download. **Download Again** provides a fallback.

## Verification status and limitations

- GitHub CI includes the original v1.25.3 Steam626 observed-key projection and the v1.26.1 real-profile-derived redacted 643 fixture.
- Node tests cover all five DLCs, all six storefronts, missing records, partial existing records, noncanonical pre-existing values, protected data, no-op, wrong structure, version-independent acceptance, encrypted round-trip, and preservation.
- Playwright Chromium E2E covers full-page drag-and-drop with overlay, file chooser, auto-download and Download Again, invalid-file no output, no-op no download and no outbound requests.
- Genuine v1.26.1 original JSON source shape and entitlement fields are independently observed; **the browser tests use synthetic profiles**, not the original private file.
- **Four non-Switch/Steam platforms are static-evidence only.** Their distinct native binaries, real platform containers, store-service behavior and live in-game reload/sync have not been run. These are disclosed limitations, not universal mandatory blockers for the owner's static-acceptance policy.
- No direct modification of `main`, no unrequested release or merge. Publication remains a separate decision after reviewing the exact PR HEAD and acceptance record.

For the next update, re-check the original Build ID, IAP product definitions, StoreFrontGroup origin mapping and Profile structure. Continue without an arbitrary version ceiling so long as the schema remains compatible.
