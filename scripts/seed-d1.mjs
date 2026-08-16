#!/usr/bin/env node
/**
 * Seeds a D1 database with the default person type, default group/schedule,
 * default settings, and (if ADMIN_EMAIL + ADMIN_PASS are set) the bootstrap
 * admin account — the D1 equivalent of prisma/seed.ts on the other
 * branches.
 *
 * D1 has no driver reachable from a plain Node process (unlike libsql,
 * which can talk to Turso from anywhere) — bindings only exist inside the
 * Workers runtime. So instead of connecting directly, this script builds a
 * SQL file and shells out to `wrangler d1 execute`, which is Cloudflare's
 * own supported way to run one-off SQL against D1 from a terminal.
 *
 * Password hashing happens locally with bcryptjs (pure JS, works in plain
 * Node) before the hash is embedded in the generated SQL.
 *
 * Known simplification: unlike the Prisma-based seed scripts, this does
 * not re-target an *existing* admin row if ADMIN_EMAIL is later changed to
 * a brand new address — it upserts by email only. Rotating the bootstrap
 * admin's email on an already-seeded database needs a manual
 * `wrangler d1 execute` statement.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASS=... node scripts/seed-d1.mjs [--remote] [--env <name>]
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DB_NAME = process.env.D1_DATABASE_NAME || "stena-letnak";
const remote = process.argv.includes("--remote");
const envIndex = process.argv.indexOf("--env");
const wranglerEnv = envIndex !== -1 ? process.argv[envIndex + 1] : undefined;

function sqlStr(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const now = new Date().toISOString();
  const statements = [];

  const adultId = randomUUID();
  statements.push(`
    INSERT OR IGNORE INTO "PersonType" ("id", "name", "isDefault", "createdAt")
    VALUES (${sqlStr(adultId)}, 'Dospělý', true, ${sqlStr(now)});
  `);

  const groupId = randomUUID();
  statements.push(`
    INSERT INTO "Group" ("id", "name", "isDefault", "is24_7", "createdAt", "updatedAt")
    SELECT ${sqlStr(groupId)}, 'Výchozí', true, false, ${sqlStr(now)}, ${sqlStr(now)}
    WHERE NOT EXISTS (SELECT 1 FROM "Group" WHERE "isDefault" = true);
  `);
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    statements.push(`
      INSERT INTO "GroupWindow" ("id", "groupId", "dayOfWeek", "fromMin", "toMin")
      SELECT ${sqlStr(randomUUID())}, g."id", ${dayOfWeek}, 360, 1320
      FROM "Group" g
      WHERE g."isDefault" = true
        AND NOT EXISTS (
          SELECT 1 FROM "GroupWindow" w WHERE w."groupId" = g."id" AND w."dayOfWeek" = ${dayOfWeek}
        );
    `);
  }

  const defaultSettings = {
    lock: { url: "", token: "", method: "POST", openDurationSec: 5, cooldownSec: 60, timeoutMs: 5000 },
    qrPayment: { accountNumber: "", bankCode: "", messageTemplate: "Stena Letnak {vs}", vsPrefix: "1" },
    gopay: { goid: "", clientId: "", clientSecret: "", sandbox: true },
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    statements.push(`
      INSERT OR IGNORE INTO "AppSetting" ("key", "value") VALUES (${sqlStr(key)}, ${sqlStr(JSON.stringify(value))});
    `);
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASS;
  if (adminEmail && adminPass) {
    const passwordHash = await bcrypt.hash(adminPass, 12);
    const adminId = randomUUID();
    statements.push(`
      INSERT INTO "User" ("id", "email", "name", "passwordHash", "role", "status", "personTypeId", "createdAt", "updatedAt")
      SELECT ${sqlStr(adminId)}, ${sqlStr(adminEmail)}, 'Admin', ${sqlStr(passwordHash)}, 'ROOT', 'APPROVED', pt."id", ${sqlStr(now)}, ${sqlStr(now)}
      FROM "PersonType" pt WHERE pt."isDefault" = true
      ON CONFLICT("email") DO UPDATE SET
        "passwordHash" = excluded."passwordHash",
        "role" = 'ROOT',
        "status" = 'APPROVED';
    `);
    statements.push(`
      INSERT OR IGNORE INTO "UserGroup" ("userId", "groupId")
      SELECT u."id", g."id" FROM "User" u, "Group" g
      WHERE u."email" = ${sqlStr(adminEmail)} AND g."isDefault" = true;
    `);
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), "stena-d1-seed-"));
  const sqlFile = path.join(tmpDir, "seed.sql");
  writeFileSync(sqlFile, statements.join("\n"));

  const args = ["wrangler", "d1", "execute", DB_NAME, remote ? "--remote" : "--local", "--file", sqlFile];
  if (wranglerEnv) args.push("--env", wranglerEnv);

  console.log(`Running: npx ${args.join(" ")}`);
  execFileSync("npx", args, { stdio: "inherit" });

  rmSync(tmpDir, { recursive: true, force: true });
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
