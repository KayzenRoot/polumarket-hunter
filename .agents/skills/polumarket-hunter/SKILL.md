---
name: polumarket-hunter-conventions
description: Development conventions and patterns for polumarket-hunter. TypeScript project with conventional commits.
---

# Polumarket Hunter Conventions

> Generated from [KayzenRoot/polumarket-hunter](https://github.com/KayzenRoot/polumarket-hunter) on 2026-10-26

## Overview

This skill teaches Claude the development patterns and conventions used in polumarket-hunter.

## Tech Stack

- **Primary Language**: TypeScript
- **Architecture**: type-based module organization
- **Test Location**: separate
- **Test Framework**: vitest

## When to Use This Skill

Activate this skill when:
- Making changes to this repository
- Adding new features following established patterns
- Writing tests that match project conventions
- Creating commits with proper message format

## Commit Conventions

Follow these commit message conventions based on 34 analyzed commits.

### Commit Style: Conventional Commits

### Prefixes Used

- `feat`
- `docs`
- `fix`
- `ci`
- `chore`

### Message Guidelines

- Average message length: ~57 characters
- Keep first line concise and descriptive
- Use imperative mood ("Add feature" not "Added feature")


*Commit message example*

```text
docs: record clean-checkout runbook evidence and ECC Tools choice (#76)
```

*Commit message example*

```text
research: publish v0.1 evidence and no-go recommendation (#75)
```

*Commit message example*

```text
fix: calibrate recording validation to live feed behavior (#74)
```

*Commit message example*

```text
ci: slim release artifact to production paths (#69)
```

*Commit message example*

```text
feat: add reproducible Docker runtime and CI smoke (#67)
```

*Commit message example*

```text
fix: make recording filenames unique per session (#73)
```

*Commit message example*

```text
docs: record release dry-run evidence and final gate status (#70)
```

*Commit message example*

```text
ci: add tag-driven release with SBOM and checksums (#68)
```

## Architecture

### Project Structure: Monorepo

This project uses **type-based** module organization.

### Configuration Files

- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/pr-title.yml`
- `.github/workflows/release.yml`
- `.github/workflows/scorecard.yml`
- `.github/workflows/security.yml`
- `Dockerfile`
- `apps/server/package.json`
- `apps/server/tsconfig.json`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `package.json`
- `packages/core/package.json`
- `packages/core/tsconfig.json`
- `packages/persistence/package.json`
- `packages/persistence/tsconfig.json`
- `packages/polymarket/package.json`
- `packages/polymarket/tsconfig.json`
- `packages/testkit/package.json`
- `packages/testkit/tsconfig.json`
- `playwright.config.ts`
- `tsconfig.json`
- `vitest.config.ts`

### Guidelines

- Group code by type (components, services, utils)
- Keep related functionality in the same type folder
- Avoid circular dependencies between type folders

## Code Style

### Language: TypeScript

### Naming Conventions

| Element | Convention |
|---------|------------|
| Files | camelCase |
| Functions | camelCase |
| Classes | PascalCase |
| Constants | SCREAMING_SNAKE_CASE |

### Import Style: Relative Imports

### Export Style: Named Exports


*Preferred import style*

```typescript
// Use relative imports
import { Button } from '../components/Button'
import { useAuth } from './hooks/useAuth'
```

*Preferred export style*

```typescript
// Use named exports
export function calculateTotal() { ... }
export const TAX_RATE = 0.1
export interface Order { ... }
```

## Testing

### Test Framework: vitest

### File Pattern: `*.test.ts`

### Test Types

- **Unit tests**: Test individual functions and components in isolation
- **Integration tests**: Test interactions between multiple components/services
- **E2e tests**: Test complete user flows through the application

### Coverage

This project has coverage reporting configured. Aim for 80%+ coverage.


*Test file structure*

```typescript
import { describe, it, expect } from 'vitest'

describe('MyFunction', () => {
  it('should return expected result', () => {
    const result = myFunction(input)
    expect(result).toBe(expected)
  })
})
```

## Error Handling

### Error Handling Style: Try-Catch Blocks

This project uses **custom error classes** for specific error types.

A **global error handler** catches unhandled errors.


*Standard error handling pattern*

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('User-friendly message')
}
```

## Common Workflows

These workflows were detected from analyzing commit patterns.

### Feature Development

Standard feature implementation workflow

**Frequency**: ~16 times per month

**Steps**:
1. Add feature implementation
2. Add tests for feature
3. Update documentation

**Files typically involved**:
- `apps/server/src/*`
- `apps/server/test/*`
- `apps/web/src/*`
- `**/*.test.*`
- `**/api/**`

**Example commit sequence**:
```
feat: bootstrap paper-first polymarket scalper terminal
chore: guard major TypeScript Dependabot updates (#2)
chore: update CodeQL actions to v4.39.1 (#6)
```

### Test Driven Development

Test-first development workflow (TDD)

**Frequency**: ~4 times per month

**Steps**:
1. Write failing test
2. Implement code to pass test
3. Refactor if needed

**Files typically involved**:
- `**/*.test.*`
- `**/*.spec.*`
- `src/**/*`

**Example commit sequence**:
```
test: add tests for user validation
feat: implement user validation
```


## Best Practices

Based on analysis of the codebase, follow these practices:

### Do

- Use conventional commit format (feat:, fix:, etc.)
- Write tests using vitest
- Follow *.test.ts naming pattern
- Use camelCase for file names
- Prefer named exports

### Don't

- Don't write vague commit messages
- Don't skip tests for new features
- Don't deviate from established patterns without discussion

---

*This skill was auto-generated by [ECC Tools](https://ecc.tools). Review and customize as needed for your team.*
