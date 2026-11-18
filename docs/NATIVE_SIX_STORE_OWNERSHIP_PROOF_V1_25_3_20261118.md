# v1.25.3 six-store DLC ownership: original-native proof

**2026-11-18. Static verification of the four older DLC passes, not a claim of game testing on non-owned consoles.**

This audit supersedes the tentative mapping discussion in `MULTIPLATFORM_DLC_FEASIBILITY_20261118.md` and `SIX_STORE_EXISTING_DLC_READINESS_20261118.md`. The source archive was not sufficient on its own; we obtained and inspected the actual matching Switch v1.25.3 ELF, original IL2CPP dump, string literal table and original `protoDb.bin`.

## Original files and chain of custody

| Original | Bytes | SHA-256 |
|---|---:|---|
| `main.elf` | 192,176,944 | `e99b1aa67ec729053d847adb3621d63e4f2ced570826b8b923531378752b8ebf` |
| `dump.cs` | 59,628,222 | `638a5618728e92821ab146d4281e7cc47657785317a065e810a83034c217bf6b` |
| `stringliteral.json` | 5,126,747 | `07fddfde3c45e1aed88e3f1c0db3721f80e7ddc3407df21f62b6a372ee1bfd1a` |
| `protoDb.bin` | 1,164,172 | `1912bb552abddac8b112fa5a781a0401672add38a62276d6c9174db39b899ae1` |

From original ELF `.note`: full GNU Build ID `9a239d3db569756d9eaaabd79771c522`, Switch cheat Build ID `9A239D3DB569756D`. ELFs' section RVA and file offsets are not interchangeable: `.text` VMA `0`, file offset `0xA78`; `.rodata` VMA `0x91C3000`, file offset `0x91C34F8`. The verifier translates ELF section addresses to offsets before comparing exact opcodes and integer tables. Never apply these RVAs unchanged to another executable.

The four originals are stored privately in the project Drive; do not commit or distribute proprietary binaries, dump text, personal profiles or product secrets in this repository.

## Native link 1 — Current storefront group

`StoreFrontGroup.SetCurrentStoreOrigin` at RVA `0x03F64380` receives an origin integer. At `0x03F643B4` it calls `GetByOriginId` (`0x03F63EB0`), then at `0x03F643E0` stores the selected `StoreFrontGroup` in the static current-group field `+0x20`. `get_CurrentStoreFrontGroup` at `0x03F64160` loads this same `+0x20` field. There is no hardcoded Nintendo/Steam-only selection in this identified path.

Original `protoDb.bin` `Definitions.StoreFrontGroup` field 5 (`OriginIds`) resolves to:

| Group `UniqueName` | `OriginIds` | Market family |
|---|---:|---|
| `Steam` | 1 | Steam |
| `Sony` | 2 | PS4 / PS5 region stores |
| `Nintendo` | 3 | Nintendo / Nintendo eShop |
| `Microsoft` | 4 | Xbox / OneStore |
| `Epic` | 5 | Epic custom storefront ID 0 |
| `Apple` | 6 | Apple / standard Mac App Store |
| `AppleArcade` | 7 | Separate, excluded from paid-DLC patching |

The names are original protobuf values, not invented platform aliases. `Apple` is not `AppleArcade`. The original database has 49 IAP definitions and exactly seven StoreFrontGroups.

## Native link 2 — PackName uses those exact names

`IAPData.get_KeyFriendlyId` at RVA `0x03F83410` loads:

- `0x03F83434`: `ldr x19,[x19,#0x18]` → `IAPData.UniqueName`.
- `0x03F83468`: `ldr x20,[x8,#0x18]` → current `StoreFrontGroup.UniqueName`.
- `0x03F8357C`: `mov x0,x19`, `0x03F83580`: `ldr x1,[x8,#0xBE0]`, `0x03F83588`: `mov x2,x20`, `0x03F8358C`: `ldr x3,[x8,#0xC20]`.
- `0x03F835A0`: branch to the managed string-concatenation helper `0x06255100`.

The original `stringliteral.json` maps absolute generated literal references `0xB287BE0` to `"_"` and `0xB288C20` to `"_OnlineKey"`. These are literal references used by the native code, not guessed punctuation. Exact key form:

```text
IAPData.UniqueName + "_" + StoreFrontGroup.UniqueName + "_OnlineKey"
```

The existing genuine Steam v1.25.3 encrypted profile independently contains matching Nintendo and Steam entries for all four original expansion passes.

## Native link 3 — Saved map key and ownership entry

`Profile.ApplyExpansionsOwnershipStatus` starts at RVA `0x05A1F860`.

| RVA | Native effect |
|---|---|
| `0x05A1FD2C` | `ldr x21,[x8,#0x18]` extracts the current group `UniqueName` |
| `0x05A1FDA8` | `ldr x0,[x24,#0xB0]` loads Profile ownership map |
| `0x05A1FDBC` | `mov x1,x21` supplies that group name as the lookup key |
| `0x05A1FDC0` | `bl 0x03C14440` performs map lookup |
| `0x05A1FE90` | `mov x1,x21` supplies the same key on map insertion |
| `0x05A1FE98` | `mov x2,x22` supplies new ownership set |
| `0x05A1FE9C` | `bl 0x03C148E0` inserts the new map entry |
| `0x05A201EC` | `bl 0x03F83410` constructs KeyFriendlyId |
| `0x05A2044C` | `bl 0x05A4AF60` writes that string into `PackName` |
| `0x05A20450` / `0x05A20458` | Reads IAP type `[x23,#0x38]`, writes `PackType` at `[x24,#0x20]` |
| `0x05A2045C`–`0x05A20470` | Selects saved ownership `Type` through lookup table |

The IL2CPP `Profile.ExpansionPackOwnershipByPlatform` is protobuf field 102 and a `MapField<string, ExpansionPackOwnershipSet>` at runtime `+0xB0`. `IAPType.ExpansionPack=2`, matching each actual base expansion-pass IAP. `ExpansionPackOwnership.Types.OwnershipType.TypePurchased=0`. The referenced purchase-type table at original `.rodata` RVA `0x093A48F0` begins with int32 values `[0,10,1,2]`; the search-success status 0 maps to purchased 0. The native code handles other search statuses differently; this is not proof that every server or network state results in a purchase.

## Four old passes × six normal stores

| DLC | Observed legacy any-platform ID | Original IAP UniqueName |
|---|---|---|
| A Rift in Time | `Expansion01` | `Expansion1PackExpansionPass` |
| The Storybook Vale | `Expansion02` | `Expansion2PackExpansionPass` |
| Wishblossom Ranch | `Expansion03` | `Expansion3PackExpansionPass` |
| Honeyglow Woods | `WinnieDLC` | `MiniExpansion1PackExpansionPass` |

For each of the four original UniqueNames, real `protoDb.bin` products exist on Nintendo, Steam, Xbox/Microsoft, four PS4/PS5 market IDs, AppleAppStore and Epic custom market 0. Combined with the **same native producer** for `StoreFrontGroup.UniqueName` map keys and KeyFriendlyId, this yields 24 exact `PackName` definitions and six saved map group names. The four `LastKnownBoughtExpansionsAnyPlatform` IDs are independently grounded in old real saved ownership evidence; do not assert that an IAP `AssociatedExpansion` field was present or independently established in those IAP rows.

## Reproduce without publishing source originals

Place private original files locally and run:

```sh
node tools/verify-native-six-store.mjs --elf /private/v1253/main.elf --literals /private/v1253/stringliteral.json --protodb /private/v1253/protoDb.bin --dump /private/v1253/dump.cs
```

The fail-closed verifier checks exact file SHA-256/size, AArch64 ELF sections and 24 instruction encodings, two native string literal values, 49 IAP records, seven original group names and origin IDs, real four-pass marketplace presence, original IL2CPP fields/enum values, purchase-type lookup, all 24 production entitlement definitions and AppleArcade exclusion. Only hashes, proof code, test fixtures and these derived facts belong in GitHub; original proprietary bytes stay private. The separate `tests/six-store-static-readiness.test.js` and Chromium E2E check the generated profile behavior on synthetic encrypted inputs.

## Remaining risks and acceptance model

**Statically confirmed for this original Switch build:** common storefront group selection, exact string concatenation, map-key producer, all six OriginIds, original DLC IAP marketplace coverage and expected purchased-record fields.

**Not confirmed:** independent Epic/Xbox/PlayStation/Mac native code binary equivalence, real platform save containers, game reload behavior and platform service response on those hardware/software clients, cloud sync persistence, or actual DLC license/cross-buy. This is a local profile editing tool, not an entitlement to a storefront purchase.

The owner can test Switch/Steam only. The lack of four other physical client devices is no longer a mandatory blocker for **static-contract validation and development**, but must be disclosed as an unverified runtime limitation for any eventual release. The existing six-store writer is activated only on the Draft PR, not merged into main; keep all public support claims conditional on that distinction. Fail closed above GameInfo.Version 626; after the November 18 game update, validate new binaries, actual new save versions and the fifth DLC separately before enabling them.
