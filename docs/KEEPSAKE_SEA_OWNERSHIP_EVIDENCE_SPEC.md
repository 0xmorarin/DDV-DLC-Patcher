# The Keepsake Sea — DLC ownership evidence intake (2026-11-18)

Status: EVIDENCE_PENDING. This procedure does not activate or assert support for the new paid expansion.

## Evidence sources
- Work only from backed-up, legitimately obtained local DDV profiles; preferably two snapshots of the same profile before/after DLC recognition.
- Keep unmodified encrypted originals outside the public repository. Never commit full profiles, personal identifiers, account data, credentials or game assets.
- Record console/client type and the exact game version, main NSO SHA-256, full module ID, 16-character Build ID, NPDM Program ID and GameInfo.Version separately. None is interchangeable.
- Distinguish expansion access, Deluxe edition bonuses, bundle rewards, time-limited cosmetics, and platform-specific ownership checks.

## Minimal redacted field evidence
For each before/after snapshot, capture:
- Platform: Nintendo or Steam; observed standard/Deluxe/bundle acquisition.
- GameInfo.Version as actually observed.
- LastKnownBoughtExpansionsAnyPlatform: only an array of observed identifier strings.
- ExpansionPackOwnershipByPlatform.Nintendo.Entries and/or .Steam.Entries: each entry projected to only PackName, PackType and Type.
- Actual offline game recognition, if tested; results of online resynchronization separately.
- Observed changes (additions AND removals) relative to the same original profile.

Do NOT infer Expansion04, Expansion4Pack, PackName, platform keys or any edition bonus from naming conventions.

## Validation and release checklist
1. Verify authentic observed new-DLC field values independently for each supported platform. Missing one platform means no claim of support on that platform.
2. Confirm the new profile schema, version and serialization on the actual updated game; reject unsupported and contradictory records.
3. Update js/config.js only with evidence-backed definitions; retain original four DLC entries and ordering.
4. Update the four-entry PRE-RELEASE GATE in tests/keepsake-readiness.test.js to an evidence-backed five-entry expectation, using exact observed new IDs. Never disable that tripwire merely to make CI green.
5. Run npm test and browser tests with backed-up disposable profiles: Nintendo, Steam, both, already owned, partial, unrelated entries, malformed records, idempotency, plaintext/encrypted round trip, no data loss and no upload/network activity.
6. Verify expected actual offline game behavior on the recorded build. A local ownership field does not establish a purchase or platform entitlement.
7. Only after evidence, CI and runtime checks may the draft PR be merged and a new release published. Repeat compatibility review for the December 9 update.

Status transition: PREPARED -> EVIDENCE_RECEIVED -> STATIC_VERIFIED -> DEVICE_VERIFIED -> PUBLISHED.
