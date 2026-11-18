# Automatic all-verified-platform DLC patch workflow (2026-11-18)

**Owner UX decision:** no per-platform selection; no Patch button. One file drop / Choose File invokes the complete operation automatically.

## Implemented Draft PR behavior

1. Input file chosen or dropped (exactly one) -> read -> validate/decrypt with existing DDV profile codec (plain JSON and AES-encrypted supported).
2. Validate `GameInfo.Version >= 591` and all required profile safety fields. No network calls.
3. Build a single patch plan for `AUTO_PATCH_PLATFORMS`. This is a **versioned allowlist of verified save-writing targets**, not the number of marketplace groups seen in IAP data.
4. If no additions: report **Already fully patched** for every currently supported DLC on all currently verified target platforms. No re-encryption, no generated output or download.
5. If additions: clone input; add missing expansion IDs and platform entries only; validate allowed changes, protected-profile SHA-256, encrypt, decrypt, and validate full round-trip. Request automatic browser download of `profile.json`.
6. If browser blocks download: **Download Again** remains available. **Change File** and keyboard-friendly **Choose File** are preserved.
7. Any unsupported schema, contradictory existing entitlement or round-trip mismatch fails closed, without generating a patched file. A `loadSerial` guard prevents stale concurrent tasks from downloading after switching inputs.
8. The current product catalog includes the four original v1.25.3 expansion passes. The November 18, 2026 `The Keepsake Sea` pass remains **evidence-gated** and cannot be claimed to be covered until actual new-build IDs and entries have been extracted.

## Verification boundaries

- **One logical cross-save Profile schema** for all standard editions; do not require a separate game save schema for each marketplace. Store-specific ownership entries are different keys *inside* the same Profile.
- Standard marketplace groups: `Nintendo`, `Steam`, `Epic`, `Microsoft` (Xbox/Microsoft Store), `Sony` (PS4/PS5), `Apple` (standard Mac App Store). This complete six-group registry is `STANDARD_STOREFRONT_GROUPS`; the current evidence-gated **write allowlist** remains `Nintendo`, `Steam`.
- New storefront writers require exact `IAPData.get_KeyFriendlyId` strings and observed or independently proven ownership behavior, **not** platform-specific logical save-schema verification. The physical console export/encryption wrapper remains a separate transport question.
- **Explicit exclusion:** `AppleArcade` is a separate edition with expansions/adventure packs bundled by default and its own cross-save ecosystem; the DLC ownership patch has no purpose there. Keep it out of both the storefront registry and the writer.
- Deluxe/Ultimate edition purchases and online premium grants are not edited.
- Neither a local save ownership marker nor a patcher success message asserts purchased storefront entitlement, online verification, or cross-buy.
- An actual Playwright/browser E2E user-gesture download and offline device reload still need independent verification. The existing GitHub Actions test is Node contract/static UI testing, not a completed browser download test.

## Regression evidence

Run `npm test` on the draft branch. Automated tests cover both verified platforms, partial additions, all-owned skip, encrypted input, idempotency, protected fields, retained edition-like records, unsupported structures, contradiction errors, and HTML removal of legacy controls.

**Release gate:** Re-run CI on final new DLC Build; validate new catalog keys and the exact six standard storefront ownership identifiers inside the shared Profile before extending the allowlist; do not invent separate save structures. Preserve main until ready.
