# Amiga Specialty HR Platform

Complete shareable source snapshot for the Amiga Specialty HR web application.

## Included

- `artifacts/amiga-hr` — HR web application
- `artifacts/api-server` — API server
- `lib/` — shared database, API contracts, and generated client packages
- `scripts/` and `docs/` — project scripts and technical documentation

## Run locally

This is a pnpm workspace. Install dependencies with `pnpm install`, then use the workspace scripts in the package files. Clerk and object-storage credentials are intentionally not included; configure those through your environment's secret manager.

Workspace-private agent notes, conversation attachments, screenshots, dependency folders, build output, and archives are intentionally excluded from this public source snapshot.
