# v1.26.1 exact-native DLC ownership evidence — six ordinary stores

**Implementation update (2026-11-19):** The fifth pass and all six normal storefronts are now active on Draft PR #1. The old 626 version ceiling was removed; current policy is structural profile validation and insert-only ownership records. Earlier statements below about future-only candidates or the version ceiling describe the pre-activation stage. See [the current implementation contract](./V1261_UNIFIED_FIVE_DLC_PATCHER_CONTRACT_20261119.md). Original native findings and source hashes remain valid.

**Status: NEW_BUILD_NATIVE_STATIC_VERIFIED; private source evidence retained; independent four-store runtime untested.** This is a new build-specific audit. Do not reuse v1.25.3 RVAs as though the executable were unchanged.

## Original source identity and integrity

All items below were opened from the user's private DDVRENX incoming folder. Original file bytes were read, not inferred from archive names or manifests.

| Source | Actual bytes | SHA-256 |
|---|---:|---|
| Switch `main` NSO | 99,766,816 | `3e127d189106162c939f3afbaa4d7de12cd0e15277c9b2e7a4a912faed0d67ba` |
| NSO decompressed `.text` | 162,397,040 | `04734882051d695da2589fb905370a5989f8af6f3e78c6e93b776a5f49243dbd` |
| NSO decompressed `.rodata` | 27,137,116 | `42d74f610541529ddf4976cd6a8a730d2ddfd7e74deebe8c1214ed9ea4f62307` |
| IL2CPP `dump.cs` | 62,282,691 | `c2b5eac582b8459cdac9b325b8f3c986371e112f996f8cfb3d2fcb014c5a2107` |
| `stringliteral.json` | 6,790,439 | `a4b1f3617d075fb7ac5f5de29c6d5ba175a2618ff284ffb91fa475635cb2a023` |
| RomFS `StreamingAssets/protoDb.bin` | 1,335,720 | `dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623` |

The original NSO header has magic `NSO0`, **full 16-byte Build ID `3346726B2F640E01EF664D98EB2CF5A0`**, and Atmosphère cheat Build ID prefix `3346726B2F640E01`. The actual `StreamingAssets/FullVersion.txt` is `releases_1.26ex-v1.26.1-633-g45e7ee77d30a-incremental-18`. The decoded save separately reports `GameInfo.Version=643`, `InitialVersion=518`. These are distinct identities. The original NSO SHA-256 matches the private direct patch stage's independently recorded original, but that stage's cheat trial is unrelated to the DLC Patcher.

NSO `.text` has memory RVA base `0x00000000` and decompressed size `0x09ADFB70`. `.rodata` memory RVA starts at `0x09AE0000`. File offsets inside the compressed NSO must not be mistaken for uncompressed RVAs.

## Static link 1: origin selects a shared StoreFrontGroup

- `StoreFrontGroup.SetCurrentStoreOrigin` at RVA `0x040BA9F0`: `0x040BAA24` executes `BL 0x040BA520` (`GetByOriginId`), then `0x040BAA50` stores the result into the static current-group field `+0x20`.
- `StoreFrontGroup.get_CurrentStoreFrontGroup` at `0x040BA7A0`, instruction `0x040BA7D0`, returns the same `+0x20` group. The source code branches are not hardcoded to Nintendo or Steam.
- Original new `protoDb.bin`: seven `Definitions.StoreFrontGroup` records, with **actual field 5 OriginIds**:

| Group UniqueName | OriginIds | Product-market mapping |
|---|---:|---|
| Steam | 1 | Steam |
| Sony | 2 | PS4/PS5 SEIE/SEIA |
| Nintendo | 3 | Nintendo/NintendoEShop |
| Microsoft | 4 | Xbox/OneStore |
| Epic | 5 | Custom Epic ID 0 |
| Apple | 6 | Apple/AppleAppStore |
| AppleArcade | 7 | Other title's bundled-content category, excluded |

## Static link 2: exact KeyFriendlyId, no inferred separators

`IAPData.get_KeyFriendlyId` at RVA `0x040DE660` reads the IAP UniqueName from `+0x18` (`0x040DE684`) and the current `StoreFrontGroup.UniqueName` from `+0x18` (`0x040DE6B8`).

At `0x040DE7D0`, argument `x1` is loaded from static literal address `0xBCB9138`; original `stringliteral.json` decodes that exact address as `"_"`. At `0x040DE7DC`, argument `x3` comes from `0xBCBA190`, whose original decoded literal is `"_OnlineKey"`. The caller places IAP name in `x0` and current-group name in `x2`, and tail-branches to the string concatenation routine at `0x064FE5E0` (`0x040DE7F0`).

Therefore the new build's generated `PackName` is:

```text
IAPData.UniqueName + "_" + StoreFrontGroup.UniqueName + "_OnlineKey"
```

The source group names in this expression come from the seven original protobuf records, not a guessed list of platform brand aliases.

## Static link 3: group name is also the serialized ownership-map key

`Profile.ApplyExpansionsOwnershipStatus` at RVA `0x05D1B380`:

| RVA | Register/data effect |
|---|---|
| `0x05D1B84C` | `LDR x21,[x8,#0x18]` reads current group UniqueName |
| `0x05D1B8C8` | `LDR x0,[x24,#0xB0]` reads `Profile.ExpansionPackOwnershipByPlatform` |
| `0x05D1B8DC` | `MOV x1,x21` uses that group name as lookup key |
| `0x05D1B8E0` | Map lookup helper |
| `0x05D1B9B0` | `MOV x1,x21` uses the same group name as insertion key |
| `0x05D1B9B8` | `MOV x2,x22` supplies the new ownership set |
| `0x05D1B9BC` | Map insertion helper |
| `0x05D1BD0C` | `BL 0x040DE660` generates `PackName` |
| `0x05D1BF6C` | `BL 0x05D63FC0` sets `PackName` |
| `0x05D1BF78` | Writes IAP `PackType` to ownership entry `+0x20` |
| `0x05D1BF90` | Writes ownership `Type` to entry `+0x24` |

The new IL2CPP metadata retains protobuf field 102, `MapField<string, ExpansionPackOwnershipSet>`, runtime field offset `+0xB0`. It identifies `IAPType.ExpansionPack=2` and `ExpansionPackOwnership.Types.OwnershipType.TypePurchased=0`. The new NSO original purchase-state table at rodata RVA `0x09CC2B90` has int32 values `[0,10,1,2]`; success maps to `TypePurchased=0`. Other entitlement-result branches have distinct values and must not be conflated with purchased state.

This directly establishes **map key = current StoreFrontGroup.UniqueName** for this shared native routine, and **PackName = same group name + IAP name**. It materially resolves the ambiguity left in the old preflight static work. The four unowned hardware clients' independent binaries and server-side entitlement decisions were not examined.

## Original IAP and new DLC evidence

New `protoDb.bin` has **53 IAPData** definitions (v1.25.3 had 49) and still seven StoreFrontGroups. These are five actual ExpansionPass IAPs with `Type=2` and product coverage for **Nintendo, Steam, Epic, Microsoft/Xbox, Sony/PS4/PS5 and AppleAppStore**:

| Any-platform ID | IAP UniqueName | Classification |
|---|---|---|
| `Expansion01` | `Expansion1PackExpansionPass` | Existing |
| `Expansion02` | `Expansion2PackExpansionPass` | Existing |
| `Expansion03` | `Expansion3PackExpansionPass` | Existing |
| `WinnieDLC` | `MiniExpansion1PackExpansionPass` | Existing |
| `Expansion04` | `Expansion4PackExpansionPass` | **New evidence-backed candidate** |

**Important nuance:** the ExpansionPass IAP's `AssociatedExpansion` field is empty, including the newly added pass. The new `Expansion4PackDeluxeEdition` IAP has `AssociatedExpansion=Expansion04`. The new actual Switch profile independently contains both `Expansion04` and `Expansion4PackExpansionPass_Nintendo_OnlineKey`. The fifth ID is grounded through the combined IAP family and saved ownership, not falsely attributed to a nonempty pass field.

## Original real Switch profile observation (private)

A 13,835,084-byte, SHA-256 `d1de0223a37b0cd245c2185b0ed0c12f2f01937c52f8528636b33de76da38fe1` source file was opened locally. It is a JSON profile, not the compressed NSO or an encrypted Steam profile. Player identifiers and unrelated private records are not published.

- `GameInfo.Version=643`, `InitialVersion=518`; known Profile validator shape fields are present.
- `LastKnownBoughtExpansionsAnyPlatform` contains `Expansion01`, `Expansion02`, `Expansion03`, `Expansion04`, `WinnieDLC` and `BaseGame`.
- Saved ownership map keys are `Nintendo` and `Steam`.
- Nintendo contains the new fifth-pass `Expansion4PackExpansionPass_Nintendo_OnlineKey` with `PackType=ExpansionPack`, `Type=Type_Purchased`, plus a separate Deluxe-edition record that must be preserved, not synthesized.
- Steam contains the four older pass records, giving a useful real-world *partial cross-store* ownership reference.
- JSON parsing found no integer outside the JavaScript safe integer range.

These observations do **not** prove offline recognition for Epic, Sony, Microsoft or Apple, nor that a synthetic file loaded by one of those clients will be accepted.

## Verification and code-use boundary

Reproducible fail-closed verifier:

```sh
node tools/verify-native-six-store-v1261.mjs --nso /private/new/ExeFS/main --text /private/decompressed-text.bin --rodata /private/decompressed-rodata.bin --literals /private/new/stringliteral.json --protodb /private/new/protoDb.bin --dump /private/new/dump.cs --profile /private/new/redacted-original.profile
```

The `--profile` argument is optional. The verifier checks all source sizes and SHA-256, full NSO Build ID, AArch64 instructions, native literals, `OriginIds`, product-market mappings, unchanged four old production pass definitions, added fifth IAP family and, optionally, the observed fifth-pass saved record. Inputs are local only; no user data appears in the verifier output. Decompressed sections can be produced with an NSO-capable local extraction tool that preserves their memory segment contents; use the exact recorded hashes to prevent mixing builds.

`tests/v1261-five-pass-static-readiness.test.js` exercises a redacted synthetic `GameInfo.Version=643` projection and five-pass candidate against all six groups without importing private save bytes. **The fifth pass is not yet activated in the Draft PR's four-pass production catalog; the version write ceiling remains 626 until new-save writer compatibility is expressly accepted.** Do not remove the upper-bound guard merely because the schema is structurally recognizable.

## Static result and honest limitation

- **Verified for actual v1.26.1 Switch binary:** origin group selection, common group-to-map-key path, exact generated `PackName`, original IAP coverage across six store groups, purchased-record representation and the fifth expansion's observed ID on Switch.
- **Verified in the current Draft PR:** six-store writer architecture for the original four passes, with synthetic encrypted round-trip, preservation and browser E2E. It remains a draft.
- **Not verified:** independent Epic/PlayStation/Xbox/Mac native binaries, separate platform save containers, four-store runtime recognition, online service rights, post-sync persistence.
- **Owner acceptance model:** no compulsory test devices outside Switch and Steam; disclose static-only verification on the other four. Do not label unknown runtime effects as successfully tested.

The evidence path and Build ID must be rechecked for every future game update, including the scheduled December 9 release.
