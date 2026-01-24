# Server Audit Report: opensky

**Generated:** 2026-01-24 13:38:43 UTC
**Audit Script:** scripts/audit-server-patterns.sh

## Summary

| Metric | Count |
|--------|-------|
| Checks Passed | 16 |
| Drift Detected | 1 |

## Reference Versions (from skeleton)

| Package | Reference Version |
|---------|-------------------|
| @modelcontextprotocol/ext-apps | ^0.4.1 |
| @modelcontextprotocol/sdk | ^1.25.1 |
| zod | ^4.1.13 |

## Drift Items (Requires Update)

| Category | File | Issue | Current | Reference |
|----------|------|-------|---------|-----------|
| IMPORT_HELPERS | `src/server.ts` | ext-apps helpers | `registerAppTool/registerAppResource` | `this.server.registerTool/registerResource` |

## Recommended Actions

1. **Run `/update-server opensky`** to interactively apply fixes
2. Or manually update files based on drift table above
3. After updates, run `npm run type-check && npm run build:widgets` to validate

## Reference Sources

Pattern comparisons based on:
1. `mcp-apps/patterns/EXTRACTED/` - Auto-generated from official SDK examples
2. `mcp-server-skeleton-ideal/` - Production-ready skeleton
3. `.claude/rules/` - Actionable rules for Claude

To update references: `./scripts/sync-upstream-full.sh`
