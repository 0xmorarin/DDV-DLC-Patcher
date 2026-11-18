# Edition entitlement / offline reward research — 2026-11-18

Status: STATIC CANDIDATES IDENTIFIED; NO EDITION-BONUS PATCH ENABLED; OFFLINE AUTO-GRANT NOT PROVEN.

## Why revisit this now

The Keepsake Sea Deluxe Edition includes Flounder and Sebastian, two Adventure Companions with bonding levels and an Ariel-related quest, in addition to cosmetics, a house style and Moonstones. Raw item collection additions do not establish companion quest unlocks. Official sources:
- https://disneydreamlightvalley.com/ja/news/update-nov-18-2026
- https://gameloft.helpshift.com/hc/en/66-disney-dreamlight-valley/faq/5763-what-is-included-in-disney-dreamlight-valley-the-keepsake-sea----deluxe-edition/
- https://gameloft.helpshift.com/hc/en/66-disney-dreamlight-valley/faq/3579-how-will-the-additional-content-included-with-my-purchase-of-the-game-be-distributed/
- https://gameloft.helpshift.com/hc/en/66-disney-dreamlight-valley/faq/2914-i-still-don-t-have-my-founder-s-pack-rewards/

Gameloft describes edition reward distribution via in-game mailbox and player account on first play; console Founders Pack deluxe rewards are restricted to the purchasing primary account. This does not prove which, if any, edition rewards can be locally regenerated without online service.

## Concrete project data and source status

1. Present patcher main/PR branch: js/config.js defines expansion entries Expansion01, Expansion02, Expansion03 and WinnieDLC only. js/ownership.js edits LastKnownBoughtExpansionsAnyPlatform and selected ExpansionPackOwnershipByPlatform.*.Entries, while preserving other existing entries. No edition additions currently exist; first public commit already omitted editions. This is not a reversible Git removal.
2. DDV_ACQUISITION_PROVENANCE_NOTES_v1.24.13.md: Definitions.IAPData.Rewards contains direct package-linked reward definitions. Identified package names include DeluxeEditionExpansion3 and UltimateEditionExp3 (FrozenInspiredSaddleBlanket reward). Exact runtime granting is NOT established by this data.
3. DDV_V1.25_LIVEOPS_ITEM_PROVENANCE_AND_ONLINE_SYNC_RESEARCH_2026-09-28: IAPData has Rewards, extended rewards, IsLocalEntitlement, OwnershipCheckRequired. OnlineMessageData has separate Rewards and OnlineRewards with ownership filters. These are distinct systems; local IAP data presence does not imply an offline grant.
4. Reexamined actual v1.25.3 global-metadata.dat (36,539,992 bytes, TID 0100D39012C1A000, BID 9A239D3DB569756D). Identified exact metadata strings HasEditionOrEquivalentOwnership, IsLocalEntitlement, OwnershipCheckRequired, GetLocallyInstalledEntitlementsAsync, AutoRedeemFoundersPackAsync, TrackClaimedFoundersPackAsync, OnFoundersPackClaimed*, BestFounderPack, and IsFoundersPack. The names establish possible code-path targets ONLY; no native call graph or execution evidence yet.
5. DLC_UNLOCK_STATIC_VERIFICATION_HANDOFF_CURRENT documents effective expansion ownership (Profile.get_OwnedExpansions and get_OwnedExpansionsAnyPlatform) separately from OnlineClient local/native purchase state. That research tested expansion access, NOT Deluxe reward claim or companions.

## Distinct falsifiable hypotheses

- H1: A valid local EditionPack record changes edition status or feature/quest gates, but does not deliver claimed bonus rewards.
- H2: The edition is locally checked and IAPData.IsLocalEntitlement enables an offline one-time reward grant.
- H3: Edition ownership only becomes active after platform entitlement resolution, AutoRedeemFoundersPack, or server mailbox processing; changing local records alone does not grant rewards.
- H4: Some rewards (item cosmetics) are direct save-owned objects, while companion unlocks, quests, Moonstones, or inbox entries are on different state/entitlement paths.

Do not promote any hypothesis to fact from metadata names or IAP reward definitions alone.

## Experimental acceptance protocol

A. Obtain safely backed-up, legitimately sourced paired profiles with verified Standard and Deluxe states, ideally same platform/account pre/post purchase, both online-recognized and offline test copies. Extract ONLY redacted edition-related ownership entries, GameInfo.Version and outcome diffs. Avoid any personal/account data in public Git.
B. Independently observe the EXACT edition-specific PackName, PackType, Type, platform mapping, related IAP IDs and any changed local grant-history/quest state; compare with v1.25.3 IAP definitions and new build. Never guess based on Deluxe name or Expansion numbering.
C. For each recorded exact build: control load with original profile; offline load with edition-fields-only mutation on disposable backup; offline load with expansion+edition fields; then restart and save/reload. Distinguish changes in displayed edition status, inbox message, ListInventory ownership, companion/quest availability, one-time grant history, and Moonstone account balance.
D. Cross-check relevant v1.25.3 and new-build IL2CPP/native path: HasEditionOrEquivalentOwnership -> IAP/condition/claim consumers, IsLocalEntitlement/OwnershipCheckRequired actual values for the package, AutoRedeemFoundersPack and mailbox/network dependencies. Method-name matching is not proof of same code path.
E. Require no unrelated profile modifications, no duplicate grants, and no online ownership claim. Never synthesize receipts, tokens, or claimed-state markers. Use only tested version/schema allowlists.
F. If edition records measurably affect legitimate offline UX or companion/quest state, design a separate explicit opt-in Edition module in the draft branch; keep base expansion patch behavior and existing four catalog entries unchanged until reviewed. If only server-delivered rewards are affected and cannot be locally granted, explain that limitation instead of promising an unlock.

### Release gate

PENDING: Actual verified edition ownership records, IAP local flag values and paired offline experimental results. Therefore no edition writes have been enabled and the draft PR must not be merged based on this document.

This study is separate from identifying the new Keepsake Sea expansion access ID. It is also separate from direct item GetAll ownership and server-granted premium currency.


## 2026-11-18 v1.25.3 native static audit: concrete outcome

Original v1.25.3 Switch NSO and IL2CPP metadata have now been examined with verified decompressed-segment hashes, direct ARM64 BL cross-references, and actual field loads (not only method names). Full annotated AArch64 evidence and reproducible local scripts are retained separately in the private DDVRENX research package, not copied into this public Patcher repository.

- `IAPType.ExpansionPack` and `IAPType.ConsumableEditionPack` are distinct native enum values (2 and 4).
- `Profile.HasEditionOrEquivalentOwnership` is called by `GetPurchasablePacksForExpansion` in the purchase-availability chain, reachable from Premium Shop models. It scans related existing platform ownership entries. The observed native filter skips ordinary ExpansionPack entries and family-sharing entries; a matching non-ExpansionPack / non-family-sharing entry can change the shop's edition-equivalence result.
- This proves a **conditional local shop-listing/ownership-equivalence effect**. It does not prove delivery of any DLC edition cosmetics, Moonstones, dedicated quests, or adventure companions.
- A separate `AutoRedeemFoundersPack` service request includes installed entitlements, marketplace and founder-pack unique names; the cloud-side redemption state machine references PlayFab user/inventory/grant operations. `TrackClaimedFoundersPack` records history, not evidence of a local reward grant.
- `IAPData.IsLocalEntitlement` and `OwnershipCheckRequired` have verified native field offsets, but their actual Boolean values for any target Deluxe package remain **unavailable** without original serialized IAP instances. The new Keepsake Sea reward path also requires new-build verification.
- The current public patcher must NOT insert guessed edition IDs, receipts, grant histories, or a `PackType=ExpansionPack` record as a substitute for a distinct edition entry.

**Decision:** A separate opt-in Edition mode is technically motivated because edition ownership can affect shop state. Actual writing, edition entitlement IDs and any claim of offline rewards remain evidence-gated. The mainline four-DLC catalog and the PR's Draft state remain unchanged.
