# Management through GitHub's own account session

The owner chose to keep GitHub Pages and move all administration to GitHub's native pages. The public website must never request or store a personal access token or a model API key. Readers need no login. GitHub handles sign-in and repository authorization on its own domain.

## Entries
- Research interests → edit `config/interests.json` on main using GitHub's editor. Preserve the existing seven topics, English keywords, necessary keyword groups and four conference sources. Committing triggers the existing collection/deployment workflow.
- Model settings → Actions repository Secrets. Store a model API key once, then the scheduled/manual collector reuses it; there is no daily key prompt. The separate Variables page controls the OpenAI-compatible base URL and model ID. Existing secrets, including legacy versioned LLM_API_KEY model profiles, remain valid and untouched.
- Update/cache → the existing Paper Daily workflow page. Run workflow with `clear_cache=false` for ordinary collection, or explicitly set `clear_cache=true` for rebuilding paper history. Merely opening the link must not trigger a run.

## Implementation and boundaries
Replace the token-admin dialog with three native GitHub navigation links and a short static management guide. Remove the now-unused public API client, token/model credential forms, browser encryption bundles and corresponding obsolete frontend tests. Preserve the existing paper browser, filters, themes, collection rules, secrets, model-profile compatibility and workflow YAML. Do not implement a backend or browser credential persistence. No credentials are embedded in links or source. Git history keeps earlier implementations recoverable.

## Verification
Run Python collector and management tests, `node --check web/app.js`, and `git diff --check`. Validate native GitHub URLs and the published token-free page in the browser without saving native settings or exposing secrets. Tests guard against reintroducing password fields, PAT API clients or runtime authenticated GitHub requests in the public website.
