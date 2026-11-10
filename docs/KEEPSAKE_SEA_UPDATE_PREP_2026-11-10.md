# The Keepsake Sea — pre-release compatibility checklist

Status: PREP_ONLY / NO NEW DLC ID CONFIRMED / NO PATCHER SUPPORT CLAIM.
Target release: 2026-11-18 (JST). The exact update build, save schema, DLC identifiers, and entitlement strings are unknown before real files are available.

## Existing browser implementation (2026-11-10 main baseline)
- UI `index.html`; application `js/app.js`.
- `js/config.js` owns the four currently recognized DLC entries, platform-specific mapping, and minimum profile version.
- `js/ownership.js` constructs additive plans for `LastKnownBoughtExpansionsAnyPlatform` and `ExpansionPackOwnershipByPlatform`.
- `js/profile.js` parses and encrypts DDV profiles; `js/validator.js` enforces ownership-only change and encrypted round-trip preservation.
- Existing support is offline only; online ownership synchronization can overwrite local profile records.

## Release-blocking evidence
1. Obtain licensed new-version saves with *confirmed* DLC state, ideally both DLC-owned and DLC-not-owned samples. Preserve original backups and minimize extracted personal data.
2. Compare `GameInfo.Version`, structure and types; independently identify the Keepsake Sea any-platform ID, pack family and exact Nintendo/Steam entitlement entries. **Do not guess Expansion04 or Expansion4Pack.**
3. Confirm selected platform behavior and what the game actually accepts offline. A recorded ownership field is not proof of entitlement granted by platform/service.
4. Add only verified definitions, plus an explicit allowlist for newly tested profile versions/schemas. Fail closed for unsupported schemas; do not relax shape checks to achieve compatibility.
5. Tests: clean save, partially owned, already owned (idempotency), no-DLC/new DLC, Switch only, Steam only, both, conflicting record, malformed fields, future/old version, unsafe JSON integer, decrypt/encrypt round trip, no unrelated changes, no cloud/upload/network side effects.
6. Verify complete browser workflow, downloaded file, original backup recovery, and offline re-open in a controlled environment.

## Release discipline
This branch is for preparation and tests only. Do not change the DLC catalog or merge into main until the exact IDs and save records have been validated on the new game build. Keep this public repository free of private saves, extracted secrets and unlicensed game assets.
