# v1.26.1 actual-save local regression — 2026-11-19

**Status: LOCAL_REAL_SAVE_PASS / ORIGINAL_UNMODIFIED / DEVICE_RELOAD_UNTESTED.**

Tested source snapshot: `8e7956a1d15b10a098025459100b049e9d362b79`. The actual GitHub source was downloaded from the CI-generated exact-HEAD artifact `ddv-patcher-local-source` (run [44350362685](https://github.com/0xmorarin/DDV-DLC-Patcher/actions/runs/44350362685)), extracted locally and checked against the original actual-save bytes; no synthetic replacement of the patcher engine.

## Input

Authorized backup of the original Switch v1.26.1 Profile: 13,835,084 bytes, SHA-256 `d1de0223a37b0cd245c2185b0ed0c12f2f01937c52f8528636b33de76da38fe1`. This is a **real private save**, not a synthesized sample. Its GameInfo.Version is **643**, and InitialVersion **518**. Native ownership-map keys: `Nintendo` and `Steam`; 9 and 4 existing entries respectively, and all five common DLC IDs already present.

## Patcher invocation and results

The actual `patchProfileBytes` API accepted the original plain JSON and returned `patched` with 21 added store-specific pass entries and **zero** common ID additions:

| Group | Inserted records |
|---|---:|
| Nintendo | 0 |
| Steam | 1 — new fifth pass |
| Epic | 5 |
| Microsoft | 5 |
| Sony | 5 |
| Apple (ordinary Mac App Store) | 5 |
| **Total** | **21** |

The result is a valid 458,192-byte encrypted profile ZIP/AES payload, SHA-256 `46ed0fb2776b74d9e6e25a1b15dcb9e86e33b710ff8b4d25eee5554d4f4db70e`.

Reloading that generated encrypted output with the real engine produced `already-patched`, `totalAdded=0`, `output=null`: a clean no-op.

## Independent preservation audit

A **separate Python verifier** decoded the resulting encrypted output using independent `cryptography` AES-ECB, Python `zipfile` with ZIP CRC checks, and `json`:

- Exactly one ZIP `profile` member, successful CRC.
- **All 23** non-ownership top-level Profile fields and the complete original common DLC ID array are JSON-value-identical.
- Nintendo's original ownership node, all 9 entries and metadata: **exact match**.
- Steam's original 4 entries are preserved in their existing order, with one new fifth-pass entry.
- Epic/Microsoft/Sony/Apple: exactly five correct pass entries each; all fields match the v1.26.1 native-derived catalogue.
- GameInfo.Version stayed at 643. Source file SHA-256 was unchanged after processing.

No original or modified personal save bytes are committed. Do not attach the original profile or encrypted output to a public GitHub issue or artifact.

## Additional local checks

- `npm test` executed against the actual extracted GitHub source: **58 PASS / 0 FAIL**.
- `tools/verify-native-six-store-v1261.mjs` executed on local **original** NSO, decompressed text and rodata, string literals, dump.cs, protoDb and source save: **STATIC_PASS**, six original hashes matched, 21 native instruction checks, two literal checks, 53 IAP definitions, six ordinary storefront groups and `Expansion04` verified.
- GitHub Actions `ownership` and Chromium `browser` jobs both successful at the exact tested source HEAD.

## Boundary

The local Chromium process launched, but its page navigation was denied with `net::ERR_BLOCKED_BY_ADMINISTRATOR`, including loopback and file URLs; therefore **an actual-save local browser UI run is not claimed**. The already green GitHub Actions browser E2E tests use **synthetic** encrypted profiles.

Not verified by this local test: game-engine reload, DLC content availability, the four other platforms' own native binaries/containers, server entitlements or synchronization. These are separate from the proven local Profile edit, static save-key generation and preservation contract.

The user can test the game on Nintendo Switch and Steam; independent hardware testing of Epic, Microsoft, Sony and Apple is **not** a mandatory acceptance gate under the owner's static-analysis policy.
