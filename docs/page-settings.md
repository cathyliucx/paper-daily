# Page-managed research interests and cache rebuilds

## Objective and acceptance
The public Pages site keeps its existing read-only paper browser. Two labelled header buttons open research-interest and cache settings. Repository owners may connect using a fine-grained GitHub token restricted to this repository (Contents: read/write; Actions: read/write; Metadata: read). The credential is held in memory only, cleared on disconnect/page reload, and never included in content, links, logs or storage.

The interest form lists the actual repository configuration, appends one validated topic (maximum ten), preserves all sources and existing topics, and writes using the current content SHA. A competing edit must cause a conflict, never an overwrite. Chinese names/descriptions and English keywords are supported; optional AND groups retain the existing precise retrieval behaviour. Saved changes trigger the existing workflow with clear_cache=false. If dispatch fails after the commit, report the saved commit separately and offer a retry without saving the topic again.

Clear cache dispatches the existing workflow with clear_cache=true and lookback_days=7. It rebuilds historical paper data using current interests; it does not remove interests, credentials or repository source. The old published dataset remains visible until a successful deployment. Both operations show queued/running/success/failure separately and link to the actual GitHub Actions run. Polling is bounded and errors do not report success. No workflow changes or new dependencies are needed.

## Plan and structure
1. Implement and test `web/repository.mjs`: topic validation, GitHub configuration read/write, dispatch and run tracking. Tests use Node's built-in runner and a fake external HTTP boundary.
2. Add `web/settings.mjs`, accessible native dialogs and theme-aware mobile styles. Keep settings separate from existing paper rendering.
3. Document token permissions and outcomes, run tests, review security/concurrency, publish and verify the deployed page.

## Commands and style
- `python3 -m unittest discover -s tests -v`
- `node --test tests/test_repository.mjs`
- `node --check web/settings.mjs`
- `git diff --check`
- `python3 -m http.server 8791 --directory web` for browser QA.
Use ES modules, small named functions, const/let and textContent for external text. Preserve existing Python and HTML conventions.

## Boundaries and validation
Always validate input, preserve configuration and surface partial failures. Never store tokens, change workflows, change existing research interests or widen conference sources. Test duplicate/limit/English keyword validation, UTF-8 save, conflicts, dispatch cache semantics, permission failures and correct run identification. Browser QA checks desktop/mobile layouts and form validation; authenticated writes are exercised with an in-memory server, without placing the agent's CLI credential in a public page.
