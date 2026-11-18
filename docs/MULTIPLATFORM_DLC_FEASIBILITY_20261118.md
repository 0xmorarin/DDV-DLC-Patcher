> **Current status (2026-11-18, original-native recheck):** This document predates the verified AArch64 and original-protobuf proof. The Draft PR now activates the six standard groups for the four original DLCs. Original `main.elf`, `stringliteral.json`, `dump.cs` and Switch `protoDb.bin` establish the common storefront selection, map key, exact `PackName` assembly and purchased type. Hardware/runtime on Epic/Microsoft/Sony/Apple remains untested; the patch has not merged to main. See [original-native proof](NATIVE_SIX_STORE_OWNERSHIP_PROOF_V1_25_3_20261118.md). Historical two-store-only and unconfirmed-key language below is superseded.

# Multi-platform DLC patch feasibility — static evidence (2026-11-18)

**Research only, not a supported-platform announcement.** Nintendo + Steam remain the only currently enabled write groups; the shared logical Profile schema applies to all standard editions. The source is the legitimately obtained v1.25.3 Steam `protoDb.bin`, cross-referenced with the v1.25.3 Switch IL2CPP `dump.cs` and the current Patcher source. Full method, hashes, script and summarized JSON are archived privately in the project's DDVRENX research folder as `DDV_DLC_PATCHER_MULTIPLATFORM_STATIC_RESEARCH_20261118.zip`.

## Observed source schema

- `Profile.ExpansionPackOwnershipByPlatform` is `Map<string, ExpansionPackOwnershipSet>` (field 102, runtime `+0xB0`). It can structurally hold multiple named platform entries, but **a store group name is not proof of a valid save key**.
- Parsed 1,944 root protobuf records, including 49 real `Definitions.IAPData` and **7 `Definitions.StoreFrontGroup`** definitions from 1,164,172-byte database SHA-256 `1912bb552abddac8b112fa5a781a0401672add38a62276d6c9174db39b899ae1`.
- Exact observed group names and store/market mappings:

| Group `UniqueName` | Mapped marketplace enum values | Implication |
| --- | --- | --- |
| `Nintendo` | Nintendo 1, NintendoEShop 7 | Existing support |
| `Steam` | Steam 5 | Existing support |
| `Microsoft` | Xbox 4, OneStore 2; PlayFab MicrosoftStore 6 | Xbox and Microsoft-store family candidate |
| `Sony` | PS4_SEIE 200 / SEIA 201; PS5_SEIE 202 / SEIA 203; PlayFab PlayStationStore 8 | PS4/PS5 family candidate |
| `Epic` | Custom `MarketplaceEpicId=0` | Epic candidate; *custom path*, not generic unsupported game |
| `Apple` | Apple 0, AppleAppStore 9 | Apple / Mac App Store candidate |
| `AppleArcade` | no normal marketplace mapping, PlayFab NotSupported 1000 | Dedicated bundled-content business model, NOT a normal paid-DLC candidate |

The four original expansion pass packages (`Expansion1PackExpansionPass`, `Expansion2PackExpansionPass`, `Expansion3PackExpansionPass`, `MiniExpansion1PackExpansionPass`) each include real storefront product records for Nintendo, Xbox, Steam, all four PS4/PS5 regional group entries, AppleAppStore and Epic (the latter via `CustomStoreFrontProductIds`). **Store product IDs are not save `PackName` values.** This dataset predates the new November 18 DLC.

## Architecture clarification — owner decision 2026-11-18

**One cross-save logical Profile schema for standard editions, not one separate game-save schema per marketplace.** `Profile.ExpansionPackOwnershipByPlatform` is already a common string-keyed map; a Profile transferred through DDV's cross-save system can carry entries for all standard storefront groups. PlayStation cross-save is supported since June 18, 2025. We therefore **do not require a new game-Profile schema implementation, or a different game-save model for each marketplace**, and do not gate storefront support on the assumption of platform-specific logical layouts.

Keep three layers separate:

1. **Logical Profile:** shared message/schema used by the game, including `LastKnownBoughtExpansionsAnyPlatform` and `ExpansionPackOwnershipByPlatform`.
2. **Entitlement source IDs:** `StoreFrontGroup.UniqueName`, `IAPData.get_KeyFriendlyId`, exact `PackName` and `Type`. This differs by marketplace **inside the same Profile**. Accurate strings and online/offline behavior still need verification.
3. **Physical export/wrapper:** native console save-container or encryption/ZIP envelope may differ in local extraction workflows; official cross-save does not by itself prove byte-identical files exported from each console. The Patcher works on a decoded common Profile and its supported input codec, not the native container.

**Apple Arcade is explicitly excluded, permanently for the current paid-expansion patch purpose.** The Arcade Edition bundles all existing expansion/adventure packs by default and has a separate cross-save ecosystem; no storefront DLC ownership patch is needed. `Apple` is the *standard Mac App Store* group, not `AppleArcade`.

The desired end-state is one drop-to-download action that writes all six standard marketplace ownership groups at once. Adding a group to the active writer requires confirming exact entitlement key generation (not proving a different Profile schema), preserving unrelated entries, and run-time persistence. This document is historical: its earlier per-platform schema/sample language below is **superseded** by this clarification.

Official facts:
- https://gameloft.helpshift.com/hc/en/66-disney-dreamlight-valley/faq/4830-cross-save-now-supported-on-playstation/
- https://gameloft.helpshift.com/hc/en/66-disney-dreamlight-valley/faq/3554-do-expansions-and-adventure-packs-support-cross-buy-across-multiple-platforms/
- https://gameloft.helpshift.com/hc/en/78-disney-dreamlight-valley-apple-arcade/faq/3564-how-is-disney-dreamlight-valley-arcade-edition-different-from-buying-disney-dreamlight-valley-on-the-mac-app-store-or-other-platforms/
- https://gameloft.helpshift.com/hc/en/66-disney-dreamlight-valley/faq/3546-does-disney-dreamlight-valley-arcade-edition-have-cross-save-1701254314/

## Feasibility, outstanding gates

- **Epic:** most practical next candidate, pending authentic redacted Epic `ExpansionPackOwnershipByPlatform` keys/entries and encrypted `profile` codec round trip.
- **Microsoft/Xbox:** candidate, but Xbox and Microsoft Store may use shared or distinct save keys/containers. Need real samples and per-client runtime checks.
- **Sony PS4/PS5:** candidate. PS version/region and the native console-save envelope need verification. Official PlayStation cross-save has been supported since June 18, 2025, but that does not prove a local raw-save codec.
- **Mac App Store:** candidate via AppleAppStore marketplace. Actual save map key and file profile/codec must be observed.
- **Nintendo Switch 2:** no separately verified DLC/save-key row from this source. Do not assume that an engine Switch2 enum proves cross-version compatibility.
- **Apple Arcade:** currently outside the product scope; its version includes expansions without individual premium purchase/Store-front entitlement handling. Treat its save schema as a distinct title.

The current patcher `AUTO_PATCH_PLATFORMS` and `DLC_CATALOG.entitlements` still activate Nintendo and Steam; the shared-profile patch planner preserves all other existing platform entries. `STANDARD_STOREFRONT_GROUPS` enumerates the six standard edition groups and excludes AppleArcade. **Do not add guessed strings** such as `Expansion3PackExpansionPass_Epic_OnlineKey` or `Expansion3PackExpansionPass_Sony_OnlineKey` without authentic profile evidence. `StoreFrontGroup.UniqueName` and `ExpansionPackOwnershipByPlatform` keys are separate concepts.

## Next verified route

1. Finish native derivation of `IAPData.get_KeyFriendlyId` and its literal separators; cross-check actual `PackName` and platform map keys where available. **Do not seek independent Profile schemas:** the logical schema is shared.
2. Continue using the one shared JSON/Profile parser and existing encrypted codec, while validating transport wrappers independently if user-exported local files are not already in supported form.
3. Activate additional storefront entitlement definitions and regression tests only after source-accurate keys are established. Validate all original DLCs, preservation of other ownership entries, offline behavior, reload persistence and subsequent sync.
4. Repeat product-ID/schema research for the November 18 expansion in its actual updated game data. Do not infer it from v1.25.3.

Official platform, cross-save, cross-buy and Arcade context:
- https://gameloft.helpshift.com/hc/ja/66-disney-dreamlight-valley/faq/3556-what-platforms-is-disney-dreamlight-valley-on/
- https://gameloft.helpshift.com/hc/en/66-disney-dreamlight-valley/faq/4830-cross-save-now-supported-on-playstation/
- https://gameloft.helpshift.com/hc/en/66-disney-dreamlight-valley/faq/3554-do-expansions-and-adventure-packs-support-cross-buy-across-multiple-platforms/
- https://gameloft.helpshift.com/hc/en/78-disney-dreamlight-valley-apple-arcade/faq/3564-how-is-disney-dreamlight-valley-arcade-edition-different-from-buying-disney-dreamlight-valley-on-the-mac-app-store-or-other-platforms/

**Updated:** Common standard-storefront group registry and AppleArcade exclusion tests have been added. Production entitlement writer remains Nintendo/Steam-only pending exact key validation. The PR remains Draft.


## Native save PackName construction — Switch v1.25.3

The actual AArch64 provides stronger support than storefront existence alone:

- `IAPData.get_KeyFriendlyId` RVA `0x03F83410`: native loads `IAPData.UniqueName` (`+0x18`) and the current `StoreFrontGroup.UniqueName` (`+0x18`) from its referenced singleton; the tail at `0x03F8359C` invokes a four-piece string concatenation. The two literal separator/suffix strings were not independently extracted from IL2CPP literal tables.
- `Profile.ApplyExpansionsOwnershipStatus` at `0x05A201EC` explicitly calls this getter, uses the resulting key to check purchase/online ownership, and assigns the key to `ExpansionPackOwnership.PackName` at `0x05A2044C` under the successful entry-generation branch.
- Observed existing Nintendo/Steam values match `IAPData.UniqueName + "_" + StoreFrontGroup.UniqueName + "_OnlineKey"`. Therefore equivalent string construction for Microsoft/Sony/Epic/Apple is **strongly indicated**, but each platform's actual save map key, exact runtime branch conditions and reload behavior remain unverified. **Do not enable inferred values as verified support.**

Full reproducible private static audit updated as `DDV_DLC_PATCHER_MULTIPLATFORM_STATIC_RESEARCH_REV2_20261118.zip` in the DDVRENX v1.25.3 analysis folder.
