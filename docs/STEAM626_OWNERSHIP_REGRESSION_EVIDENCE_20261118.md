# v1.25.3 Steam Profile 626: redacted ownership regression evidence

Status: real-save static inspection completed on November 18, 2026. This is not a new-expansion or six-store runtime validation.

## Authentic input

A privately stored November 2026 Steam `profile.json` backup was read without modifying the source file. Its encrypted length was 455,072 bytes, aligned to the AES block size. Decryption produced a ZIP archive containing the `profile` entry, whose uncompressed size was 5,135,824 bytes. The decoded Profile reported `GameInfo.Version=626` and `GameInfo.InitialVersion=518`. The current profile version is the compatibility input; initial version is not interchangeable.

The ownership map had two observed keys: `Nintendo` and `Steam`. Both contained the four regular expansion passes with `PackType=ExpansionPack` and `Type=Type_Purchased`. The four `LastKnownBoughtExpansionsAnyPlatform` IDs were `Expansion01`, `Expansion02`, `Expansion03` and `WinnieDLC`. Additional unrelated records were present and must be preserved.

The eight observed PackName values are captured as string assertions in `tests/steam626-observed-ownership.test.js`. The executable fixture in that test is a synthetic and redacted projection. It is **not** a committed actual profile, and it is not a substitute for a real-save encrypted-browser round trip. No account identifiers, save payloads, or personal details are present in the repository.

## Compatibility boundary

The maximum directly observed current `GameInfo.Version` for this evidence set is 626. The draft writer now rejects higher values until their serialization and ownership representation are inspected. This upper bound is a temporary safety gate, not a claim that all older versions have been individually validated. Update the bound only after reviewing the real post-release profile version and relevant schema.

## Remaining evidence

- The Keepsake Sea: new build and actual `AssociatedExpansion`, IAP UniqueName, ownership identifiers and profile representation remain unobserved.
- Epic/Microsoft/Sony/Apple: storefront IAP definitions are known, but exact saved ownership map keys, PackName literals and offline reload behavior are not observed.
- A full actual-save JS runtime test and browser E2E download check are distinct from this sanitized ownership regression.
- Do not merge or publish the draft until new-DLC and target-store write evidence is sufficient.
