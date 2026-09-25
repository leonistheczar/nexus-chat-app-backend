# Repository Guidelines

## Project Structure & Module Organization

This repository contains the Nexus backend API. Application code is under `src/`: `app.ts` configures Express and middleware, `routes/` holds API routes, `middlewares/` contains shared middleware, and `db/` contains the Drizzle connection and PostgreSQL schemas. `types/` holds shared TypeScript declarations. Drizzle migration files are under `drizzle/`; update schemas in `src/db/schemas/` and generate migrations rather than editing generated metadata by hand.

## Build, Test, and Development Commands

Use pnpm, as specified by `packageManager`:

- `pnpm install` installs dependencies.
- `pnpm dev` runs the API with `tsx` watch mode.
- `pnpm build` type-checks and emits JavaScript to `dist/`.
- `pnpm start` runs the configured start script.
- `pnpm db:generate` creates migrations from schema changes.
- `pnpm db:migrate` applies pending migrations.

There is no test or lint script configured currently. Run `pnpm build` to check TypeScript changes.

## Coding Style & Naming Conventions

Write TypeScript using ES modules and strict typing. Match the neighboring file’s indentation and formatting; use descriptive camelCase names for variables and functions, PascalCase for types, and lowercase descriptive filenames such as `userRoutes.ts` and `user.schema.ts`. Relative TypeScript imports use `.js` extensions to work with `NodeNext` module resolution. Keep route handlers focused and pass failures to the shared error handler.

## Testing Guidelines

No test framework or coverage threshold is configured. For behavior changes, include a concise manual verification note in the pull request; add automated tests when a test setup is introduced. Do not commit generated build output in `dist/`.

## Commit & Pull Request Guidelines

Recent commits use short, descriptive sentence-case subjects (for example, “Added README.md”); follow that style and describe the change clearly. Pull requests should explain the API or schema impact, list verification performed, and link related issues. Include request/response examples for endpoint changes and migration details for database changes.

## Security & Configuration

Copy `.env.example` to `.env` and provide the required database and Clerk settings locally. Never commit credentials or real environment files. Validate authenticated user identity through Clerk middleware and avoid logging secrets or sensitive profile data.
