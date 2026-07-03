
<img width="2172" height="724" alt="codiffly" src="https://github.com/user-attachments/assets/9c237024-cd58-458a-9f59-2c235e9a4094" />

# codiffly 🐨

`codiffly` is a local-first AI code review CLI. It reviews local Git diffs, existing patch files, GitHub PRs, and GitLab MRs while keeping posting disabled unless explicitly requested.

## Install

```bash
npm install -g codiffly
```

Or run it without installing globally:

```bash
npx codiffly --help
```

## Development

```bash
npm install
npm run build
npm run dev -- init
npm run dev -- review --base origin/main --head HEAD
```

## Usage

Initialize repository config:

```bash
codiffly init
```

Review the current branch against the detected default base branch:

```bash
codiffly review
```

With no config file, `codiffly` uses the `recommended` preset and built-in rules for security, secrets, API contracts, error handling, concurrency, performance, tests, accessibility, database migrations, dependencies, and infrastructure. Plugins are optional.

In an interactive terminal, `codiffly review` prints the findings and then asks what to do next: select comments one by one, post all comments, or skip posting. When posting, it infers the current GitHub PR or GitLab MR from the current branch when possible, and only asks for a number if inference fails. Select mode lets you post, skip, edit, post all remaining, or cancel for each comment.

Use a review focus when you want the prompt to optimize for a specific goal instead of trying to catch every issue in one pass:

```bash
codiffly review --focus details
codiffly review --focus maintainability
codiffly review --focus risk
```

Review explicit refs:

```bash
codiffly review --base origin/main --head HEAD
```

Review an existing unified diff:

```bash
codiffly review --diff ./changes.diff
```

Use a provider override:

```bash
codiffly review --provider mock
codiffly review --provider codex-cli
codiffly review --provider claude-cli
```

Use a platform override for PR/MR mode:

```bash
codiffly review --platform github --pr 123
codiffly review --platform gitlab --pr 123
```

Write Markdown preview to a file:

```bash
codiffly review --diff ./changes.diff --provider mock --output review.md
```

Print machine-readable JSON:

```bash
codiffly review --diff ./changes.diff --provider mock --json
```

Keep an interactive terminal open after the review output:

```bash
codiffly review --pause
CODIFFLY_PAUSE_ON_COMPLETE=1 codiffly review
```

Review a GitHub PR locally:

```bash
codiffly review --pr 123
```

Review a GitLab MR locally:

```bash
codiffly review --platform gitlab --pr 123
```

Review the findings, then choose which eligible comments to post to the selected platform. Passing `--post` skips the first action prompt and goes straight to comment-by-comment selection. Posting is never implicit:

```bash
codiffly review --post
codiffly review --pr 123 --post
codiffly review --platform gitlab --pr 123 --post
```

Interactive choices:

- `Enter` or `y`: post this comment.
- `n`: skip this comment.
- `e`: replace the comment body, then post it.
- `a`: post this and all remaining comments.
- `q`: cancel posting.

Post all eligible comments without prompting:

```bash
codiffly review --pr 123 --post --yes
codiffly review --platform gitlab --pr 123 --post --yes
```

Preview PR comments without posting, even with `--post`:

```bash
codiffly review --pr 123 --post --dry-run
```

Check unresolved PR review threads:

```bash
codiffly check --pr 123
```

Check local tool availability:

```bash
codiffly doctor
```

## Mock Provider

Use the deterministic mock provider for local development without Codex/OpenAI:

```bash
npm run dev -- review --diff ./changes.diff --provider mock
```

or set it in `.codiffly.yml`:

```yaml
provider: mock
```

## Presets, Rules, and Plugins

`codiffly` has built-in review presets and focus profiles that work without custom plugins:

```yaml
preset: recommended
focus: balanced
```

Focus keeps review quality high and token use controlled by narrowing the reviewer instructions and adding only cheap, file-matched rule context:

- `balanced`: default general-purpose changed-line review.
- `details`: subtle changed-line regressions, boundary cases, nullability, refactor consistency, and test assertion quality.
- `maintainability`: redundancy, DRY, local pattern consistency, responsibility boundaries, abstraction fit, and test maintainability.
- `risk`: production-impacting risks such as security, data loss, migrations, API compatibility, dependencies, infrastructure, error handling, observability, and rollback hazards.

Available presets:

- `recommended`: broad production review for application repos.
- `frontend`: UI, accessibility, API contracts, tests, performance, dependencies, and security.
- `backend`: API contracts, errors, concurrency, migrations, dependencies, tests, performance, and security.
- `node-api`: backend defaults tuned for Node/API services.
- `infra`: infrastructure, deployment, secrets, dependency, and security checks.
- `minimal`: security and test coverage only.

You can override the preset by listing exact built-in rules:

```yaml
rules:
  - security
  - secrets
  - api-contract
  - error-handling
  - concurrency
  - performance
  - tests
  - accessibility
  - database-migration-safety
  - dependencies
  - infrastructure
  - logic-detail
  - boundary-cases
  - nullability
  - refactor-consistency
  - test-assertion-quality
  - duplication
  - local-patterns
  - responsibility-boundaries
  - abstraction-fit
  - test-maintainability
```

Built-in rules:

- `security`: auth, authorization, injection, unsafe parsing, and data exposure risks.
- `secrets`: credentials, tokens, keys, connection strings, and unsafe secret handling.
- `api-contract`: breaking API, schema, event, public type, and CLI contract changes.
- `error-handling`: swallowed failures, bad retries, misleading fallbacks, and cleanup gaps.
- `concurrency`: races, idempotency gaps, locking issues, missed awaits, and lifecycle bugs.
- `performance`: latency, memory, query, rendering, and algorithmic regressions.
- `tests`: missing or weakened tests around changed behavior.
- `accessibility`: frontend accessibility issues in UI files.
- `database-migration-safety`: unsafe SQL and Prisma migration changes.
- `dependencies`: package, Docker, runtime, and config compatibility risks.
- `infrastructure`: deployment, permissions, networking, encryption, rollout, and observability risks.
- `logic-detail`: subtle changed-line logic regressions.
- `boundary-cases`: comparisons, limits, defaults, pagination, math, rounding, and timezone mistakes.
- `nullability`: missing null, undefined, empty, and optional-state handling.
- `refactor-consistency`: stale names and missed updates after local refactors.
- `test-assertion-quality`: tests that execute changed behavior without asserting it.
- `duplication`: concrete repeated logic, literals, conditionals, and error handling.
- `local-patterns`: inconsistency with nearby helpers and conventions.
- `responsibility-boundaries`: functions or classes taking on unrelated responsibilities.
- `abstraction-fit`: unnecessary, leaky, or missed abstractions.
- `test-maintainability`: duplicated or brittle test setup.

### Custom Rules

Custom rules are local files that export a `ReviewRule`. They are optional and intended for project- or company-specific policies that built-in rules cannot know about. They are never loaded unless explicitly listed in `.codiffly.yml`.

```ts
import type { ChangedFile, ReviewRule } from "codiffly/dist/core/types.js";

const rule: ReviewRule = {
  name: "no-dangerous-sql",
  description: "Flag risky raw SQL patterns.",
  appliesTo(file: ChangedFile) {
    return file.path.endsWith(".sql") || file.path.endsWith(".ts");
  },
  buildPromptContext(file: ChangedFile) {
    return [
      `Review ${file.path} for raw SQL hazards.`,
      "Look for string interpolation, missing parameters, destructive writes, and missing transaction boundaries."
    ].join("\n");
  }
};

export default rule;
```

Enable local plugin files with `plugins`:

```yaml
plugins:
  - ./review-rules/no-dangerous-sql.ts
  - ./review-rules/frontend-a11y.ts
```

Plugin loading is intentionally explicit:

- Only files listed in `.codiffly.yml` are loaded.
- Plugin paths must be local file paths inside the config directory.
- TypeScript plugin files may use type-only imports, but runtime relative imports should be compiled to JavaScript plugins first.
- Loading fails with a clear error if a plugin file is missing, invalid, or cannot be imported.
- Presets expand to built-in rules when `rules` is omitted.
- Built-in rules are selected by `rules`; custom rule files are selected by `plugins`.

### Example Configs

Frontend repo:

```yaml
provider: codex-cli
platform: github
preset: frontend
exclude:
  - package-lock.json
  - dist/**
  - .next/**
  - coverage/**
```

Backend repo:

```yaml
provider: codex-cli
platform: github
preset: backend
exclude:
  - package-lock.json
  - build/**
  - coverage/**
```

Full-stack repo:

```yaml
provider: codex-cli
platform: github
preset: recommended
plugins:
  - ./review-rules/no-dangerous-sql.ts
review:
  maxRiskyFiles: 12
  maxCommentTargets: 600
exclude:
  - package-lock.json
  - dist/**
  - build/**
  - .next/**
  - coverage/**
```

## Packaging

Build and package as an npm CLI:

```bash
npm run build
npm pack
```

## Tests

```bash
npm run check
npm test
```

`npm run check` runs type checking, tests, and a built CLI smoke check. Use `npm test` when you only need the unit test suite.

Lefthook installs a `pre-commit` hook during `npm install` via the `prepare` script. The hook runs `npm run check`.

The test suite covers diff target extraction, risky file ranking, provider JSON validation, Markdown rendering, and config defaults/merging. Example fixtures live in `tests/fixtures`.

The package exposes the `codiffly` binary from `bin/codiffly`.

## Providers

Initial providers:

- `codex-cli`: calls `codex exec` and expects JSON output. Requires the Codex CLI to be installed and authenticated.
- `claude-cli`: calls `claude -p` and expects JSON output. Requires the Claude CLI to be installed and authenticated.
- `mock`: deterministic comments for tests and development.

## Platforms

- `github`: uses the `gh` CLI for PR diffs, comments, and unresolved review threads. Requires GitHub CLI to be installed and authenticated with access to the repository.
- `gitlab`: uses the `glab` CLI for MR diffs, comments, and unresolved discussions. Requires GitLab CLI to be installed and authenticated with access to the project. The GitLab project path is inferred from the repository's `origin` remote, so `origin` must point at the GitLab project being reviewed.

## Safety Defaults

- Reviews local diffs by default.
- Uses `.codiffly.yml` per repository.
- Excludes lockfiles, build artifacts, minified files, and maps.
- Limits oversized diffs to high-risk files.
- Validates provider JSON with Zod.
- Filters comments to real changed-line targets.
- Never posts PR/MR comments unless `--post` is passed and the selected comments are confirmed.
