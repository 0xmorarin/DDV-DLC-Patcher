# DDV DLC Patcher

**Live app:** https://0xmorarin.github.io/DDV-DLC-Patcher/

A browser-based, local-only save-data patcher for **Disney Dreamlight Valley**. Drop a backed-up DDV profile or select a file; if any supported DLC ownership markers are missing, the patcher adds only those records, verifies the output, and downloads the result. Existing ownership records are never replaced.

## Compatibility

| Game version | DLCs considered |
| --- | --- |
| Before v1.24.1 | Not supported |
| v1.24.1 through v1.25.3 | Four DLC passes |
| v1.26.1 and later | Five DLC passes, including The Keepsake Sea |

The runtime uses `GameInfo.Version`: below **591** is rejected; **591–642** uses the original four DLC passes; **643 and later** uses all five. The observed v1.25.3 and v1.26.1 saves have values 626 and 643 respectively. Unmapped intermediate versions 627–642 conservatively use four. There is no arbitrary future maximum; the required save schema must still pass validation.

The six standard platform ownership groups are Nintendo, Steam, Epic, Microsoft, Sony and Apple (Mac App Store). Apple Arcade is excluded. Nintendo and Steam are supported by original save observations; the other four storefront mappings are derived from v1.26.1 native/static game data and **have not been tested on those platforms**.

## Use

The app is static and runs entirely in your browser. Make a separate backup of the source profile before editing. On a successful patch, your browser downloads a new `profile.json`; the original file is unchanged. When all required markers are already present, the tool reports **Already patched** and does not generate output. Invalid and too-old saves are rejected.

This is a **local save editor**, not proof of a digital purchase or a way to grant marketplace purchases. Online entitlement checks or cloud synchronization may overwrite modified ownership markers. Avoid using edited saves for online play.

To preview the current source locally, install Node.js, then launch `preview-local.cmd` on Windows or run `npm run preview`. Open `http://127.0.0.1:8765/`.

## Verification

Run `npm test` for the Node regression suite. The GitHub Actions browser job additionally tests file selection, whole-window drop, automatic download, duplicate/no-op behavior, legacy four-DLC routing, minimum version rejection, and absence of external network requests.

Only `index.html`, `style.css`, `js/`, and `assets/` are published to the hosted site. Tests, research materials, local backups and actual user saves are **not deployed**. Source code and static assets are public in this repository.

## Release notes — v1.26.1

- Added The Keepsake Sea for v1.26.1+ profiles.
- Unified the six ordinary storefront groups with an insert-only ownership policy.
- Preserved four-DLC compatibility with v1.24.1–v1.25.3 profiles.
- Added full-page file drop and automatic encrypted save download.
- Final owner-approved one-card design uses a non-repeating nebula background, accessible simple icons and concise result statuses.
