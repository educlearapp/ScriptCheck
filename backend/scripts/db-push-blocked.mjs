#!/usr/bin/env node
/**
 * Deprecated entry for `npm run db:push`.
 * Blocks accidental push against arbitrary DATABASE_URL.
 */
console.error(`db:push is disabled as an unguarded shortcut.

Use one of:
  npm run db:push:disposable --workspace=backend
    (requires DISPOSABLE_DB_ACK=I_UNDERSTAND_THIS_IS_DISPOSABLE and a local disposable DB)

  npm run db:migrate:deploy --workspace=backend
    (explicit reviewed migration deploy — not for working/production until baselined)

Application / beta startup must never run db push.
`);
process.exit(1);
