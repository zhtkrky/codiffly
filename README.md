# localrabbit

`localrabbit` is a local-first AI code review CLI. It reviews local Git diffs, existing patch files, and GitHub PRs while keeping posting disabled unless explicitly requested.

## Install

```bash
npm install
npm run build
npm link
```

## Development

```bash
npm install
npm run dev -- init
npm run dev -- review --base origin/main --head HEAD
```

## Usage

Initialize repository config:

```bash
localrabbit init
```

Review the current branch against the detected default base branch:

```bash
localrabbit review
```

Review explicit refs:

```bash
localrabbit review --base origin/main --head HEAD
```

Review an existing unified diff:

```bash
localrabbit review --diff ./changes.diff
```

Use a provider override:

```bash
localrabbit review --provider mock
localrabbit review --provider codex-cli
```

Write Markdown preview to a file:

```bash
localrabbit review --diff ./changes.diff --provider mock --output review.md
```

Print machine-readable JSON:

```bash
localrabbit review --diff ./changes.diff --provider mock --json
```

Review a GitHub PR locally:

```bash
localrabbit review --pr 123
```

Post all eligible comments to GitHub. Posting is never implicit:

```bash
localrabbit review --pr 123 --post --yes
```

Preview PR comments without posting, even with `--post`:

```bash
localrabbit review --pr 123 --post --dry-run
```

Check unresolved PR review threads:

```bash
localrabbit check --pr 123
```

Check local tool availability:

```bash
localrabbit doctor
```

## Mock Provider

Use the deterministic mock provider for local development without Codex/OpenAI:

```bash
npm run dev -- review --diff ./changes.diff --provider mock
```

or set it in `.localrabbit.yml`:

```yaml
provider: mock
```

## Review Rules and Plugins

`localrabbit` has a small rule system that adds focused prompt context only for files that a rule matches. Built-in rules are enabled from `.localrabbit.yml`:

```yaml
rules:
  - security
  - performance
  - tests
  - accessibility
  - database-migration-safety
```

Built-in rules:

- `security`: auth, injection, secrets, unsafe parsing, and data exposure risks.
- `performance`: latency, memory, query, rendering, and algorithmic regressions.
- `tests`: missing or weakened tests around changed behavior.
- `accessibility`: frontend accessibility issues in UI files.
- `database-migration-safety`: unsafe SQL and Prisma migration changes.

### Custom Rules

Custom rules are local files that export a `ReviewRule`. They are never loaded unless explicitly listed in `.localrabbit.yml`.

```ts
import type { ChangedFile, ReviewRule } from "localrabbit/dist/core/types.js";

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

- Only files listed in `.localrabbit.yml` are loaded.
- Plugin paths must be local file paths inside the config directory.
- TypeScript plugin files may use type-only imports, but runtime relative imports should be compiled to JavaScript plugins first.
- Loading fails with a clear error if a plugin file is missing, invalid, or cannot be imported.
- Built-in rules are selected by `rules`; custom rule files are selected by `plugins`.

### Example Configs

Frontend repo:

```yaml
provider: codex-cli
rules:
  - security
  - performance
  - tests
  - accessibility
plugins:
  - ./review-rules/frontend-a11y.ts
exclude:
  - package-lock.json
  - dist/**
  - .next/**
  - coverage/**
```

Backend repo:

```yaml
provider: codex-cli
rules:
  - security
  - performance
  - tests
  - database-migration-safety
plugins:
  - ./review-rules/no-dangerous-sql.ts
exclude:
  - package-lock.json
  - build/**
  - coverage/**
```

Full-stack repo:

```yaml
provider: codex-cli
rules:
  - security
  - performance
  - tests
  - accessibility
  - database-migration-safety
plugins:
  - ./review-rules/no-dangerous-sql.ts
  - ./review-rules/frontend-a11y.ts
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
npm test
```

The test suite covers diff target extraction, risky file ranking, provider JSON validation, Markdown rendering, and config defaults/merging. Example fixtures live in `tests/fixtures`.

The package exposes the `localrabbit` binary from `bin/localrabbit`.

## Providers

Initial providers:

- `codex-cli`: calls `codex exec` and expects JSON output.
- `mock`: deterministic comments for tests and development.

## Safety Defaults

- Reviews local diffs by default.
- Uses `.localrabbit.yml` per repository.
- Excludes lockfiles, build artifacts, minified files, and maps.
- Limits oversized diffs to high-risk files.
- Validates provider JSON with Zod.
- Filters comments to real changed-line targets.
- Never posts GitHub comments unless `--post --yes` are passed.
