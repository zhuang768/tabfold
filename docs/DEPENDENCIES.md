# Dependencies

All runtime code is authored in-repo. **Production extension bundle has zero npm runtime dependencies** (esbuild bundles only first-party TypeScript).

## Development / test only

| Package                               | License    | Purpose                                |
| ------------------------------------- | ---------- | -------------------------------------- |
| typescript                            | Apache-2.0 | Strict typing                          |
| esbuild                               | MIT        | Bundle MV3 entries                     |
| tsx                                   | MIT        | Run build/icon scripts                 |
| vitest                                | MIT        | Unit tests                             |
| @playwright/test                      | Apache-2.0 | Extension E2E                          |
| eslint / typescript-eslint / prettier | MIT        | Lint & format                          |
| @types/chrome / @types/node           | MIT        | Typings                                |
| jsdom                                 | MIT        | Available for DOM unit tests if needed |

No analytics, no CDN scripts, no remote code in `dist/`.
