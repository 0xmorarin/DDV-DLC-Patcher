# WBR Deluxe / Sven quest — v1.25.3 internal evidence (2026-11-18)

**Status: STATIC VERIFIED. Offline edition-only auto-grant NOT demonstrated. No production edition writer enabled.**

## Original evidence, not product-name inference

Independent original-game sources were inspected: the version-matched v1.25.3 Steam `protoDb.bin` and the actual framed `Mission.json`/`Companion.json` protobuf records, cross-checked against the Switch v1.25.3 original `main` (BID `9A239D3DB569756D`) and IL2CPP metadata. Proprietary original data and private saves are deliberately not stored in this public repo.

**WBR Deluxe serialized `Definitions.IAPData`:**

- Database key `DeluxeEditionExpansion3`, `UniqueName=Expansion3PackDeluxeEdition`.
- `IapType=4` (`ConsumableEditionPack`), `AssociatedExpansion=Expansion03`.
- `Rewards` contains Sven `ItemID=120300004, Amount=1` (same in `UltimateEditionExp3`). Base `WishblossomRanch` expansion does **not** contain Sven.
- `IsLocalEntitlement=false` (protobuf field 16 absent), **`OwnershipCheckRequired=true`** (field 21 explicitly 1).
- Native `IAPData.get_IsOnlineSyncRequired()` at RVA `0x03F83600` reads field `+0x9C`, checks `IapType` at `+0x38`, and returns **true** for the actual WBR Deluxe values. This favors an ownership verification/synchronization route over an unconditional local grant.

**Sven-related quest `2070001384`, `Story!Expansion03!ORQS_E03_Kris_010`:** The exact v1.25.3 `AvailableConditions` are the AND of `MissionStatus(2070001345, Completed=8)`, `MountIsUnlocked(120300004)`, and `CharacterUnlocked(10000070)`. **No direct edition-ownership condition.** Sven `Companion.json` has `IsSyncOnlineItem=true`, `OnlineCategory=Premium(1)`, and a separate **visibility** predicate `MissionStatus(2070001345,Completed)`.

Native `ConditionMountIsUnlocked.Evaluate` (RVA `0x04287910`) delegates to `IProfilePlayer.IsMountUnlocked`. `ProfilePlayer.UnlockMount` (RVA `0x0595AB10`) appends actual mount instances to `ProfilePlayer.Mounts` (`+0x198`). These are **separate** from `HasEditionOrEquivalentOwnership` (RVA `0x05A441E0`), whose observed direct caller relates to Premium Shop expansion purchase-filter logic. No direct edition-save-record to Sven grant/cold-load path was proven.

**Default nuance:** Legacy `FoundersPackDeluxe` serializes `IsLocalEntitlement=true`; its missing `OwnershipCheckRequired` field defaults false *on wire*, but `IAPData.SetDefaultData()` initializes the flag to true on a fresh native object. Do not generalize the Founders runtime flag from serialized field absence. WBR Deluxe explicitly sets it true.

## Answer to the specific user scenario

Writing **only** a WBR Deluxe-like edition ownership record into the save file is **not sufficient to assert Sven or Kristoff's quest will automatically appear offline**. That record does not itself satisfy the quest's `MountIsUnlocked` predicate. For the quest, the actual necessary mount record is Sven `120300004` in the game-managed unlocked mounts state, in addition to story completion and Kristoff unlock. Whether a valid edition record can indirectly cause that record to be granted through an offline cached claim is **not exhaustively disproven by static analysis** and still needs a controlled offline A/B run.

Do not confuse the package's `UniqueName` with a tested platform-specific save entitlement `PackName`/`PackType`/`Type`. Do not synthesize receipts, grant histories, inbox contents, premium currency or quest completion. Do not describe a direct `GetAllMount` code path as hardware-confirmed: a potential `DebugAddItem` -> `UnlockMount` native route is known, but transaction success/persistence were not observed.

## Next verification / release gate

For same-version backed-up profiles, compare A) unchanged original vs B) **only genuinely observed** WBR Deluxe ownership fields edited; cold-load entirely offline. Observe `Player.Mounts[*].MountItemID`, inbox state, quest `2070001384` eligibility, after-save reload, and independent sync effects; keep original data untouched. If there is no Sven mount record, the quest's mount predicate is false regardless of the edition display flag. A new-build update requires fresh schema/native/entitlement cross-validation.

**Patcher decision:** the existing four-expansion catalog remains unchanged; no WBR Deluxe writer or promised offline Sven unlock is enabled. Maintain this research on Draft PR #1 only. An edition status UI is distinct from a proven reward delivery function.
