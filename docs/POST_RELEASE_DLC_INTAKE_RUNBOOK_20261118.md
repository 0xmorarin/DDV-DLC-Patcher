> **Current status (2026-11-18, original-native recheck):** This document predates the verified AArch64 and original-protobuf proof. The Draft PR now activates the six standard groups for the four original DLCs. Original `main.elf`, `stringliteral.json`, `dump.cs` and Switch `protoDb.bin` establish the common storefront selection, map key, exact `PackName` assembly and purchased type. Hardware/runtime on Epic/Microsoft/Sony/Apple remains untested; the patch has not merged to main. See [original-native proof](NATIVE_SIX_STORE_OWNERSHIP_PROOF_V1_25_3_20261118.md). Historical two-store-only and unconfirmed-key language below is superseded.

# The Keepsake Sea DLC Patcher: post-release intake and publication gate

**Historical preflight runbook:** v1.26.1 source files were subsequently verified and the five-DLC unified patcher was implemented on Draft PR #1. Version-only blocking was removed by owner policy. Consult [the current v1.26.1+ contract](./V1261_UNIFIED_FIVE_DLC_PATCHER_CONTRACT_20261119.md) for current behavior; the steps below retain the earlier pre-release intake state as a reusable template.

Preparation date: 2026-11-18 JST. Status: **INTAKE_READY / NEW_BUILD_EVIDENCE_PENDING / RELEASE_BLOCKED**.

This document describes the next repeatable step. It does not assert that The Keepsake Sea is covered by the active patcher.

## Current grounded baseline

- Base: `main` at `35a22625329b7fcda95184cccd95e70c3c3f1caa`, Draft PR #1 at the currently inspected working head.
- Real privately stored Steam v1.25.3 encrypted profile: `GameInfo.Version=626`, `InitialVersion=518`, ownership map keys `Nintendo` and `Steam`, four existing DLC passes. Original save is never committed.
- Switch v1.25.3 baseline Build ID: `9A239D3DB569756D`. Different game version, Build ID, full module hash, title ID, and save schema numbers are different identifiers.
- v1.25.3 source research: original `protoDb.bin` SHA-256 `1912bb552abddac8b112fa5a781a0401672add38a62276d6c9174db39b899ae1`; 49 IAP records; seven storefront groups; four previously known normal expansion-pass product definitions across six standard storefronts. Stored save ownership identifiers for Epic, Microsoft, Sony and Apple have **not** been observed.
- The four-entry production catalog stays unchanged; the Draft PR now has six statically evidenced standard-store writer groups. Four non-Switch/Steam runtime clients remain untested.
- Profile writes above current `GameInfo.Version=626` abort until an explicit new-build compatibility review.

## Existing private Drive intake

<https://drive.google.com/drive/folders/15Vt9Rhigc5mRM3qSYmpLnaXK7af5LVyQ>

The existing `08_INCOMING_2026-11-18_EXPANSION_VERSION_PENDING` folder already contains these empty source-specific subfolders:

| Directory | Expected source |
|---|---|
| `01_Switch_ExeFS` | Original new-version ExeFS modules, NPDM and hashes |
| `02_Switch_RomFS` | Original new-version RomFS data and IAP-bearing assets |
| `03_Switch_Il2CppDump` | Dump, metadata and generated method/field crosswalk |
| `04_Steam_Save_Original` | Authorized, backed-up new-version Steam save |
| `05_Switch_Save_Original` | Authorized, backed-up new-version Switch save |
| `06_Steam_Build_Assets` | Steam original protoDb and related assets |
| `07_Build_Metadata_SHA256` | Exact hashes, full module IDs, title ID, build ID, version manifest |

These folder names do not prove any source file was received. Do not infer an updated DDV version or Build ID from the planned release date.

## Offline ownership-only evidence collection

Use a source backup and a second snapshot taken after the game recognizes the DLC. Do not upload the original profile to a third-party conversion site or the public repository. Run on a local checkout:

```sh
node tools/inspect-ownership-evidence.mjs --after /private/new-profile.json --output /private/ownership-after.json
node tools/inspect-ownership-evidence.mjs --before /private/before-profile.json --after /private/after-profile.json --output /private/ownership-diff.json
```

Both encrypted DDV profile bytes and unencrypted DDV JSON files are supported where the existing codec recognizes their format. Output is created with exclusive file creation, avoids overwriting an existing report, and does not modify the input. The tool checks identity equality for paired snapshots, emits only `GameInfo.Version`, `GameInfo.InitialVersion`, any-platform DLC IDs, safe-shaped `PackName` / `PackType` / `Type`, ownership platform map keys and per-group counts. Player names, account IDs, raw private DLC edition records and non-ownership data are not emitted. Unrecognized entries are counted for manual review.

The report is **evidence**, not permission to enable a writer. Validate the source platform and actual in-game purchase/recognition independently; review the redacted report before sharing even privately. An unchanged saved profile is not proof that the expansion identifier is absent from the game. When comparing two snapshots, confirm that source files are actually paired and that the timestamp and GameInfo.Version are appropriate.

## Offline protoDb definition comparison

The executable scan does not depend on external Python modules or undocumented global variables. Supply the v1.25.3 original and the actual updated original:

```sh
node tools/inspect-protodb-iap.mjs --before /private/v1253/protoDb.bin --after /private/new/protoDb.bin --output /private/new-iap-delta.json
```

It parses `Definitions.IAPData` and `Definitions.StoreFrontGroup` from the protobuf data, records IAP `UniqueName`, `AssociatedExpansion`, IAP type, standard/custom storefront product-market presence, original sizes and SHA-256 checksums, and reports added/removed/changed IAP definitions. An unreadable or unexpected protobuf format fails instead of inventing data. These are only static storefront observations, not saved ownership or purchase evidence.

## Exact new-data verification sequence

1. Verify which files arrived: inventory, original file sizes, SHA-256, complete Build ID, Title ID, GameInfo.Version, provenance, and date. Separate the source dump from reports and derived data. Verify archive contents by reading the archive, not its name or manifest alone.
2. Diff the new `protoDb.bin` IAP definitions and `StoreFrontGroup` records against the original 1.25.3 data. Record exact `UniqueName`, `AssociatedExpansion`, IAP type, marketplace mappings and available storefronts. Do not derive values from DLC title, chronology, or `Expansion04` assumptions.
3. If required, repeat the IL2CPP/native audit of `IAPData.get_KeyFriendlyId`, `Profile.ApplyExpansionsOwnershipStatus` and `ExpansionPackOwnership.set_PackName`, tracking actual instruction changes and literal values. Previously documented Switch v1.25.3 RVAs `0x03F83410`, `0x05A201EC`, and `0x05A2044C` are **old-build evidence**, not new-build constants.
4. Cross-correlate actual save `LastKnownBoughtExpansionsAnyPlatform` and `ExpansionPackOwnershipByPlatform` differences with IAP definitions. Record the exact map key and matching `PackName` / `PackType` / `Type` separately for each target storefront. Shared Profile layout is already the architectural model; do not demand an invented separate Profile class per storefront.
5. Validate the real new-version profile codec and ownership map schema. Update `MAX_VERIFIED_PROFILE_VERSION` only after compatibility is checked. Reject formats and versions that remain unverified. Do not lower protection in order to make tests pass.
6. Activate `The Keepsake Sea` in `DLC_CATALOG` only after verifying its actual ID, canonical IAP identifier and entitlement fields; replace the intentional four-entry PRE-RELEASE test gate with the evidence-backed expected catalog.
7. Reconfirm the already statically proven `Epic`, `Microsoft`, `Sony`, and `Apple` storefront contracts against any updated original binaries; keep `AppleArcade` excluded. Do not require unavailable devices as a static-analysis gate. Keep all Deluxe/Ultimate or edition-like data untouched.
8. Run `npm test`, Chromium E2E, and an actual backed-up, expendable new-version save round trip. Verify automatically downloaded output, no-op skip, no external upload, preserved non-ownership data, idempotency and failed-output suppression.
9. Validate actual offline game reload and separately report the outcome of online synchronization. Local ownership records are not purchase rights or cross-buy.
10. Review new HEAD, conflict status, CI, and the release gate. Keep Draft PR #1 and main unchanged until evidence and real-game behavior permit publishing. After release, repeat identity and compatibility checks for the 2026-12-09 update.

## Evidence levels

| Status | Meaning |
|---|---|
| PREPARATION_COMPLETE | Intake folder, safe local extractor, baseline, regression tests and publication checklist exist |
| NEW_DATA_RECEIVED | Real new-version files and their checksums were inspected, not just listed |
| STATIC_VERIFIED | IAP/PackName/schema claims are tied to the updated original data |
| SAVE_VERIFIED | Real new-version saves validate in supported codec and preserve unrelated fields |
| DEVICE_VERIFIED | Target game rebuild loads, save/reload succeeds, offline access and sync effects recorded |
| RELEASE_READY | All enabled storefronts and new DLC pass required gates; public metadata accurately discloses remaining limits |

The Draft PR currently implements six stores for the four original passes; main remains unchanged. The intended five-pass end-state still needs actual new-DLC data. Any failing required gate is a publication blocker, not permission to fill in a guessed identifier.
