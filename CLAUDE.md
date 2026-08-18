# Stěna Letňák Tišnov — pokyny pro Claude

Viz [`README.md`](README.md) pro přehled a přehled funkcí. Tento soubor je o tom, **jak** na téhle
větvi (a jejích sourozencích) pracovat.

Appka je React Router v7 (Vite, Cloudflare Workers nativně přes `@cloudflare/vite-plugin`).

## Architektura větví

Aktivně se pracuje jen na téhle čtveřici větví:

- `app` — appka samotná (DB-agnostická základna: UI, server actions, byznys logika, auth, i18n),
  bez konkrétního DB klienta.
- `stena-d1sql` — dev D1/Cloudflare Workers varianta, nasazená na dev Worker
  (`workers/app.ts` + `vite.config.ts`).
- `stena-psql` — dev PostgreSQL varianta, spustitelná v kontejneru (`Dockerfile`,
  `docker-compose.yml`), nasazená na Railway.
- `stena-d1sql-prod` — produkční D1 větev, nasazená na `stenatisnov.app` (sdílí Worker
  i D1 databázi s produkcí).

Ostatní větve v repozitáři jsou jen záloha/historie, aktivně se na nich nepracuje.

**Vždy, když začínáš práci na něčem novém, se nejdřív přepni na `stena-d1sql`**
(`git checkout stena-d1sql`) a ověř `git branch --show-current`, než začneš cokoliv měnit.
Neplatí to bezvýhradně — pokud práce cíleně patří na `app`, `stena-psql`, nebo
`stena-d1sql-prod`, přepni se rovnou tam. Jde hlavně o to nezačít nevědomky commitovat na
zbytkovou/nesouvisející větev, na které worktree zrovna z předchozí session zůstal.

⚠️ `git worktree add <cesta> <větev>` v tomhle prostředí občas (opakovaně pozorováno) přepne i
HEAD hlavního worktree na tu přidávanou větev, ne jen nový worktree samotný. Po každém
`git worktree add` (obzvlášť pro `stena-d1sql-prod`) proto v hlavním worktree ověř
`git branch --show-current`, než v něm commitneš cokoliv dalšího.

Standardní postup u změny v appce (UI/byznys logika, nic DB-specifického):

1. Implementuj a ověř na `app`.
2. Merguj do **obou** `stena-d1sql` a `stena-psql`, na každé znovu ověř (viz níže).
   Konflikty na řádcích s `getPrisma` importem (`./db.server` na D1 větvi vs. `./db` na Postgres
   větvi) jsou očekávané — vždy ponechej verzi dané větve, ne verzi z merge zdroje.

Databázové změny (schéma, migrace, D1-vs-Postgres rozdíly v `gate.ts`/`payments.ts`, viz níže) se
dělají **zvlášť na obou** `stena-d1sql` a `stena-psql` — nejdou mergovat 1:1, každá větev
má vlastní implementaci.

Pravidla pushování a nasazení:

- Nikam se nepushuje bez výslovné žádosti v daném tahu (ani `git push`, ani prod).
- Do `stena-d1sql-prod` se merguje **jen na výslovnou žádost** v daném tahu — nikdy
  automaticky jako součást běžné propagace.
- Skutečné nasazení (`wrangler deploy`, `cf:deploy`) si uživatel spouští sám ručně — needěláme ho
  automaticky ani po pushi.

## Kritický architektonický rozdíl: D1 vs. PostgreSQL

Cloudflare D1 **nepodporuje** Prisma interaktivní transakce (`$transaction(async (tx) => ...)`),
jen dávkovou pole-formu (`$transaction([op1, op2])`) — a ani ta nemá skutečné transakční záruky
(D1 varuje: "implicit & explicit transactions will be ignored and run as individual queries").
Proto `stena-d1sql`/`stena-d1sql-prod` mají v `src/lib/gate.ts` a
`src/lib/payments.ts` **jinou implementaci** než `app`/`stena-psql`:

- `app`/`stena-psql` (Postgres): běžné `prisma.$transaction(async (tx) => {...})` s reálnou
  atomicitou.
- `stena-d1sql`/`stena-d1sql-prod`: atomický "claim-then-compensate" pattern — každý
  krok je samostatný `updateMany({ where: { ..., credits: { gte: 1 } }, data: { decrement: 1 } })`
  s podmínkou přímo ve `WHERE` (atomicita na úrovni jednoho řádku/statementu), a pokud pozdější
  krok v sekvenci selže, ručně se vrátí (increment) vše už odečtené v předchozích krocích. Stejný
  vzor platí i pro potvrzení platby (`confirmPaymentOrder`/`planConfirmedOrder`) — objednávka se
  nejdřív atomicky "claimne" (`updateMany` s `status: PENDING` v `WHERE`), teprve pak se aplikují
  efekty; jinak hrozí dvojité připsání při souběžném volání (admin ruční potvrzení + Fio poll
  najednou).

Při mergování změn v `gate.ts`/`payments.ts` mezi `stena-d1sql` a `stena-psql` **nikdy
neber verzi z druhé větve 1:1** — je potřeba ručně přepsat na příslušný pattern. Konfliktní merge
zde je očekávaný, ne chyba.

## D1 adaptér tiše ztrácí sloupce na `create()`, pokud se tvar dat mění mezi voláními

Zjištěno na reálných datech v `stena-tisnov-db-dev`: `AuditLog` řádky zapsané přes `audit()`
(`src/lib/audit.ts`) měly `userId` uložené jako `NULL` asi v polovině případů, i když volající vždy
předával reálné ID (ověřeno — `CreditLegder.create()` volaný o okamžik dřív ve stejném requestu
se stejným `userId` nikdy postižen nebyl). Rozdíl: `audit()` je jediné místo v kódu, které se
volá **jednou se všemi poli** (`userId` u vstupu člena) a **jednou bez některých** (jen
`guestToken` u vstupu hosta) — `Prisma.InputJsonValue`/`undefined` pole se prostě vynechávají.
Nejpravděpodobnější vysvětlení: D1 adaptér (`engineType: "client"`) cachuje zkompilovaný SQL plán
podle *tvaru* předaných polí, a pozdější volání s jiným tvarem může omylem znovu použít plán
předchozího volání, který daný sloupec vůbec neobsahoval.

Oprava/obrana: `audit()` teď posílá **všechna pole vždy explicitně** (`?? null` /
`?? Prisma.DbNull`), nikdy je nevynechává — tvar `data` objektu je tak identický při každém volání.
Nejde o potvrzenou opravu příčiny (jen o obcházení), ale zmírnila `undefined`/vynechaná pole coby
podezřelý vzorec. Pokud narazíš na podobně "náhodně chybějící" hodnotu po `create()`/`update()` na
`stena-d1sql`, zkontroluj, jestli dané volání někde jinde v kódu běží i s jiným tvarem
`data` objektu.

## Dvě oddělené migrační soustavy

- `prisma/migrations/` + `_prisma_migrations` — Prisma Migrate (`db:migrate`/`db:deploy`), used
  na `stena-psql` (PostgreSQL).
- `migrations/*.sql` (flat adresář v kořeni repa) + `d1_migrations` — Cloudflare Wrangler
  (`wrangler d1 migrations apply <db> --remote`), used na `stena-d1sql`/
  `stena-d1sql-prod`.

Tyto dvě soustavy **spolu vůbec nesouvisí**. Změna v `prisma/schema/models.prisma` vyžaduje ruční
zápis do **obou**: vygenerovat/spustit Prisma migraci (pro `stena-psql`) A ručně napsat
`migrations/NNNN_popis.sql` ve stylu existujících souborů (prosté `CREATE TABLE`/`ALTER TABLE`,
bez Prisma "shadow database" kroků) a aplikovat ho přes `wrangler d1 migrations apply` na
příslušnou D1 databázi (`stena-tisnov-db-dev` pro `stena-d1sql`, `stena-tisnov-db-prod` pro
`stena-d1sql-prod` — vždy zvlášť, aplikace na jednu se na druhou nijak nepropaguje).

## Ověřování před commitem/mergem

- Vždy: `npm run typecheck` a `npm run lint`.
- Pro `stena-d1sql`/`stena-d1sql-prod` navíc: reálný `npm run cf:build`
  (`react-router build`, ne OpenNext) a `npx wrangler deploy --dry-run` (ověří bindings,
  nedeployuje) — ale `--dry-run` sám o sobě neodhalí všechno, spusť ho až po `cf:build` proti
  reálnému výstupu, jinak chybí `virtual:react-router/server-build` a spadne s nesouvisející
  chybou.
- Pro `stena-psql` navíc: reálné ověření v Dockeru (viz níže) — `npm run typecheck`/`lint`
  samo o sobě neodhalí runtime chyby v kontejnerovém prostředí.
- Pro UI změny: reálně otestuj v prohlížeči (dev server, nebo Docker kontejner u `stena-psql`),
  ne jen typecheck.

### Runtime testy byznys logiky a Docker ověření (`stena-psql`)

Spolehlivější než browser automatizace komplexních formulářů se stavem (checkboxy apod.) je malý
`tsx` skript, který přímo importuje a volá funkci (např. `openGateForUser` z `src/lib/gate.ts`,
`confirmPaymentOrder` z `src/lib/payments.ts`). Ověřený postup pro `stena-psql`:

1. `docker build -t <tag> .` z kořene `stena-psql`.
2. Postgres + app kontejner na sdílené `docker network` (viz `Dockerfile`/`docker-compose.yml` pro
   přesné env proměnné — `DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASS` pro
   bootstrap root účet).
3. Session cookie pro test uživatele lze namintit přímo (`commitUserSession` z
   `src/lib/session.server.ts` v malém skriptu) — nepřihlašovat se přes formulář, jen vygenerovat
   platný cookie a poslat ho v `Cookie` hlavičce (curl/fetch), případně skript zabalit
   `withLoadContext({} as AppLoadContext, main)`, pokud volaná funkce potřebuje ambient context
   (`getEnv()`/`getLoadContext()`).
4. Skript zkopírovat do kontejneru (`docker cp`) a spustit (`docker exec -w /app <container>
   npx tsx script.ts`) — spouštění mimo `/app` selže na resolution `node_modules`/`@/` aliasů.
5. Po testu kontejnery/síť/skripty uklidit (`docker rm -f`, `docker network rm`, smazat dočasné
   soubory) — nenechávej testovací artefakty v repu.

## Prostředí

- Pracovní adresář je někdy vidět jako jiná cesta než `/home/jirik/stena-letnak/stena-letnak` —
  pokud git hlásí "not a git repository", ověř `pwd`/`ls` a přepni se tam.
