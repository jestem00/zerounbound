/*Developed by @jams2blues - ZeroContract Studio
File: AGENTS.md
Rev : r9 2025-09-07 UTC
Summary: contributor & AI guide - codex optimisation guidance references root config and summarises recommended settings.
*/

Zero Unbound v4 - Contributor & Codex Guide
This guide aligns human and AI contributors working on the ZeroUnbound
project. Always reload the Manifest and TZIP invariants before you write
code or documentation. This revision introduces best-practice guidance for
optimising your local Codex environment and clarifies how to configure
the new Codex CLI. Follow these guidelines to get the most out of the
agent-powered development workflow.

1 - Repo at a Glance
The project structure, critical entry points and manifest references remain
unchanged from previous revisions and can be found in the Manifest
documentation. Refer to docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md
for a detailed source-tree map and invariant ledger.

2 - Local / Codex Dev Bootstrap
To set up your local environment:

corepack enable && corepack prepare yarn@4.9.1 --activate
yarn install --immutable

# choose the network before dev or build
yarn set:ghostnet
# or
yarn set:mainnet
yarn dev
# runs at http://localhost:3000


In Codex tasks the above runs automatically via scripts/codex-setup.sh.

2.1 Environment Flags
The v4 deployment flow now uses a single-stage origination by default.
The UI constructs the full on-chain metadata on the client and then
originates the contract directly via TezosToolkit.wallet.originate()
for all wallets. The remote forge service has been removed and there
is no Temple-specific forging path. FAST_ORIGIN and USE_BACKEND flags
remain removed. Resume support via localStorage remains available for
patch operations if needed.

Network selection remains in src/config/deployTarget.js.

3 - Optimising Your Codex Environment
The OpenAI Codex CLI is highly configurable. Our recommended setup
ensures the agent behaves predictably and efficiently in the ZeroUnbound
ecosystem. These settings strike a balance between code generation
quality, safety and minimal interruptions while respecting our security
invariants. A canonical config.toml lives at the root of this
repository. Codex will read this configuration when launched with
--config-file zerounbound/config.toml or when copied to
~/.codex/config.toml.

3.1 Configure Codex

Codex reads configuration values from $CODEX_HOME/config.toml (by
default ~/.codex/config.toml). Rather than embedding the full file
here, we maintain zerounbound/config.toml under version control.
Copy this file to your local configuration directory or reference it
directly via codex --config-file zerounbound/config.toml. The file
defines sensible defaults for model selection (gpt-5), approval
policy (on-request), sandboxing (workspace-write), reasoning
effort, verbosity, and environment isolation. Review that file for
the authoritative list of keys and keep it in sync with the Codex
documentation.

3.2 Key recommendations

Model selection: Use gpt-5 until Codex exposes gpt-5-pro. If
the pro model becomes available, update the config accordingly.

Reasoning & verbosity: High reasoning effort and detailed
summaries help with complex flows such as chunked minting and
marketplace operations. Adjust downward for faster, less verbose
sessions.

Approval policy: on-request balances autonomy and safety,
prompting only when unfamiliar commands need elevated privileges.

Sandbox mode: workspace-write permits modification of project
files and temporary directories while keeping the .git folder
read-only. Enable full access temporarily if network calls are
essential.

Environment isolation: Inherit only core variables (PATH, HOME,
USER) and exclude keys matching patterns like AWS_* or AZURE_*
to avoid leaking secrets into subprocesses.

3.3 Customising further

Refer to the Codex configuration reference
 for
additional options such as per-provider retry counts, history
persistence, notification hooks and sandbox tuning. When modifying
config.toml, update its header and increment the revision to track
changes.

4 - Validating Changes
Linting, tests and bundling commands remain the same. See previous
revision for details.

5 - Style & Architecture Rules
Unchanged. Refer to earlier revision for specifics on style, media
handling, fetch usage, and invariants.

6 - Commit & PR Convention
Unchanged. Use Conventional Commits and append a progress-ledger row to
every PR body.

7 - Working With Codex
Unchanged. Follow the guidelines for Ask and Code modes.

8 - Directory Pointers
Unchanged. See the Manifest for a complete map of critical files and
entry-points.

/* What changed & why: Updated to r9. Replaced the embedded sample configuration with a reference to the new root-level config.toml and summarised the key recommendations. The config file itself tracks the authoritative settings. Bumped revision and summary accordingly. */

10  Anti-Glyph Discipline (r10)
To avoid odd glyphs and newline artifacts entering code or docs:

- ASCII punctuation only in source: use plain quotes (' ") and hyphens (-). Do not paste smart quotes, em/en dashes, arrows or box-drawing characters.
- UTF-8 files with real newlines: never insert literal "\n" in source where an actual newline is intended.
- Imports must be single-line ASCII; do not append escaped newline fragments to import statements.
- Quick pre-commit scan: check diffs for non-ASCII (e.g., rg -n "[^\x00-\x7F]") and normalize before merge.
- Exceptions: binary assets/SVG/media payloads may contain non-ASCII; do not alter their contents.

This operationalizes manifest invariant I251 and complements the existing UTF-8/newline rule.
