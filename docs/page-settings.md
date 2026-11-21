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

## Model configuration and authorization (2026-11-21)
Add a model settings tab and header entry for an OpenAI-compatible model: provider preset, HTTPS base URL, model ID and replacement API key. To prevent a partial update from sending an old provider key to a new endpoint, save the entire runtime profile as one JSON sealed box in the existing LLM_API_KEY Actions Secret. The collector recognizes the versioned profile and still supports existing plaintext environment keys. No workflow changes are required. Updating a profile requires re-entering its key because GitHub never returns stored secret values. An empty submission never overwrites an existing key.

Use pinned, self-hosted official libsodium sealed boxes and the repository's GitHub public key. Never place credentials in repository content, browser storage, URLs or public datasets. The UI reads only secret names and non-sensitive LLM_PROFILE Actions-variable metadata. Secret persistence is authoritative and atomic; failure to write the optional display metadata is reported separately. Saving does not call a paid model endpoint or start collection. Display saved state separately from model connectivity, which remains untested until actual collection.

GitHub fine-grained tokens used for model setup additionally need Variables and Secrets read/write. Provide a prefilled creation link with a short expiry and the four needed repository permissions. No CLI credential is embedded in the public page. Sharing the site URL conveys no credentials. Sharing a management token or an already-connected browser session can allow repository changes; code editors can potentially misuse model secrets even though GitHub cannot return their plaintext.

Tests: real sealed-box round trip with generated test keys; HTTP/credential-bearing endpoint and invalid-model rejection; missing keys cause no writes; no plaintext key in transmitted GitHub payloads; permission failures make no changes; optional metadata-write failures preserve the saved runtime profile; legacy collector credentials still work; browser QA uses fake tokens and a local fake API only.
