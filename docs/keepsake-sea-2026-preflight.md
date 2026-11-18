# Keepsake Sea — November / December 2026 preflight

**PREP ONLY — NO NEW ENTITLEMENT ACTIVATED, NO RUNTIME COMPATIBILITY CLAIM.**

Official release announcement: https://disneydreamlightvalley.com/news/2026ShowcaseHighlights

| JST time (owner supplied) | Event | Gate |
|---|---|---|
| 2026-11-18 22:00 | The Keepsake Sea paid expansion | Obtain actual DLC ownership evidence |
| 2026-12-09 22:00 | 'Ohana Holidays free update | Independently recheck compatibility |

Current baseline (2026-11-10): main commit `35a22625329b7fcda95184cccd95e70c3c3f1caa`. `js/config.js` has four DLC entries: Expansion01 (A Rift in Time), Expansion02 (The Storybook Vale), Expansion03 (Wishblossom Ranch), and WinnieDLC (Honeyglow Woods). `js/ownership.js` derives both insertion order and entitlement validation from `DLC_CATALOG`; `js/validator.js` protects unrelated save data. Existing modes: Nintendo, Steam, both.

## Required evidence before changing production catalog

1. Observe the new DLC on an appropriately versioned, legitimately owned, backed-up profile. Collect only **redacted ownership-field diffs**, not personal saves or account information.
2. Confirm the exact new `LastKnownBoughtExpansionsAnyPlatform` string and both platforms' `ExpansionPackOwnershipByPlatform.<platform>.Entries` records (`PackName`, `PackType`, `Type`).
3. Do not guess `Expansion04`, `Expansion4Pack`, platform keys or a Deluxe entitlement from numbering patterns. Distinguish base expansion access, Deluxe edition cosmetics, bonus rewards and online ownership refresh.
4. Confirm whether the new game/profile uses the same fields and serialization. Unsupported or conflicting records must fail closed.
5. With verified data, add only the new catalog entry and focused tests, leaving original DLCs and unknown existing entries intact.
6. Run `npm test`; then browser checks for Nintendo/Steam/both, partial and fully present records, invalid inputs, repeat patch, plaintext/encrypted round trip and preservation of unrelated save data. Test on disposable backups.
7. Reconfirm offline game load/save and ownership detection on the exact new game build. Repeat compatibility review after the December 9 update.

**No merge/release** until exact entitlement evidence, static checks, and owner runtime acceptance are recorded. Retain original profile and the previous config blob for rollback. Online ownership synchronization can overwrite locally modified values. This draft does not modify `DLC_CATALOG`.

## Status convention

`PREPARED` → `EVIDENCE_RECEIVED` → `STATIC_VERIFIED` → `DEVICE_VERIFIED` → `PUBLISHED`.
