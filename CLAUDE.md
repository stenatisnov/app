# Stěna Letňák Tišnov — pokyny pro Claude

Viz [`README.md`](README.md) pro přehled a [`docs/SPECIFIKACE.md`](docs/SPECIFIKACE.md) pro plnou
funkční specifikaci. Tento soubor je o tom, **jak** na téhle větvi (a jejích potomcích) pracovat.

## Architektura větví a propagace změn

Tahle větev (`app`) obsahuje celou aplikaci (UI, server actions, byznys logika, auth, i18n) **bez**
konkrétního DB klienta. Z ní se odvozují DB větve (`d1sql`, `libsql`, `libsql-local`), z těch pak
finální nasaditelné `stena-*` větve (`stena-d1sql`, `stena-libsql`, `stena-libsql-local`), a nakonec
`stena-d1sql-prod`. Standardní postup u každé změny:

1. Implementuj a ověř na `app`.
2. Merguj postupně dolů řetězem: `libsql-local` → `libsql` → `d1sql` → `stena-libsql-local` →
   `stena-libsql` → `stena-d1sql`. Na každé větvi po mergi znovu ověř (viz níže).
3. `stena-d1sql-prod` se merguje a pushuje **jen na výslovnou žádost** v daném tahu — nikdy
   automaticky jako součást běžné propagace.
4. Nikam se nepushuje bez výslovné žádosti v daném tahu (ani `git push`, ani prod).

## Kritický architektonický rozdíl: D1 vs. libsql

Cloudflare D1 **nepodporuje** Prisma interaktivní transakce (`$transaction(async (tx) => ...)`),
jen dávkovou pole-formu (`$transaction([op1, op2])`). Proto `d1sql`/`stena-d1sql`/`stena-d1sql-prod`
mají v `src/lib/gate.ts` a `src/lib/payments.ts` **jinou implementaci** než `app`/`libsql`/
`libsql-local`:

- `app`/`libsql`/`libsql-local`: běžné `prisma.$transaction(async (tx) => {...})`.
- `d1sql`/`stena-*`: atomický "claim-then-compensate" pattern — každý krok je samostatný
  `updateMany({ where: { ..., credits: { gte: 1 } }, data: { decrement: 1 } } })` s podmínkou
  přímo ve `WHERE` (atomicita na úrovni jednoho řádku), a pokud pozdější krok v sekvenci selže,
  ručně se vrátí (increment) vše už odečtené v předchozích krocích.

Při mergování změn v `gate.ts`/`payments.ts` do D1 větví **nikdy neber verzi z `app` 1:1** — je
potřeba ručně přepsat na atomický pattern. Konfliktní merge zde je očekávaný, ne chyba.

## Dvě oddělené migrační soustavy

- `prisma/migrations/` + `_prisma_migrations` — Prisma Migrate (`db:migrate`/`db:deploy`), used
  pro `libsql`/`libsql-local` větve (SQLite/Turso).
- `migrations/*.sql` (flat adresář v kořeni repa) + `d1_migrations` — Cloudflare Wrangler
  (`wrangler d1 migrations apply <db> --remote`), used pro `d1sql`/`stena-d1sql`/
  `stena-d1sql-prod`.

Tyto dvě soustavy **spolu vůbec nesouvisí**. Změna v `prisma/schema/models.prisma` vyžaduje ruční
zápis do **obou**: vygenerovat/spustit Prisma migraci (pro libsql větve) A ručně napsat
`migrations/NNNN_popis.sql` ve stylu existujících souborů (prosté `CREATE TABLE`/`ALTER TABLE`,
bez Prisma "shadow database" kroků) a aplikovat ho přes `wrangler d1 migrations apply` na
příslušnou D1 databázi (`stena-tisnov-db-dev` pro `stena-d1sql`, `stena-tisnov-db-prod` pro
`stena-d1sql-prod` — vždy zvlášť, aplikace na jednu se na druhou nijak nepropaguje).

## Ověřování před commitem/mergem

- Vždy: `npm run typecheck` a `npm run lint`.
- Pro D1 větve navíc: `npm run cf:build` (OpenNext build) a `npx wrangler deploy --dry-run`
  (ověří bindings, nedeployuje).
- Pro UI změny: reálně otestuj v prohlížeči (dev server), ne jen typecheck.
- Runtime testy byznys logiky (gate open flow apod.) je spolehlivější dělat přes malý `tsx`
  skript, který přímo importuje a volá funkci (např. `openGateForUser` z `src/lib/gate.ts`), než
  přes browser automatizaci komplexních formulářů se stavem (checkboxy apod.). Skript spouštěj
  z kořene projektu (`npx tsx ./script.ts`), jinak selže resolution `node_modules`. Po testu
  skript smaž.

## Prostředí

- Pracovní adresář je někdy vidět jako jiná cesta než `/home/jirik/stena-letnak/stena-letnak` —
  pokud git hlásí "not a git repository", ověř `pwd`/`ls` a přepni se tam.
