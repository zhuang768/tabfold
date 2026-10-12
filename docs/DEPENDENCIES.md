# Dependencies

All runtime code is authored in-repo. **Production extension bundle has zero npm runtime dependencies** (esbuild bundles only first-party TypeScript).

## Development / test only

| Package                               | License    | Purpose                                              |
| ------------------------------------- | ---------- | ---------------------------------------------------- |
| typescript                            | Apache-2.0 | Strict typing                                        |
| esbuild                               | MIT        | Bundle MV3 entries                                   |
| tsx                                   | MIT        | Run build/icon/perf scripts                          |
| vitest                                | MIT        | Unit tests (vitest ^4.1.11, 0 audit vulnerabilities) |
| @playwright/test                      | Apache-2.0 | Extension E2E + perf harness                         |
| eslint / typescript-eslint / prettier | MIT        | Lint & format                                        |
| @eslint/js                            | MIT        | Flat ESLint config base                              |
| globals                               | MIT        | ESLint globals for scripts/tests                     |
| @types/chrome / @types/node           | MIT        | Typings                                              |

No jsdom (unused). No analytics, no CDN scripts, no remote code in `dist/`.

## Audit policy

- Run `npm audit` after `npm ci`.
- Do **not** use `npm audit fix --force`.
- Zero vulnerabilities reported with direct standard package lockfile (no overrides required).
- Environment-only install notices (deprecated transitive packages, script policy) are documented in TEST_REPORT when present; they are not runtime warnings for the extension.
