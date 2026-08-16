# Stěna Letňák Tišnov — pokyny pro Claude

Viz [`README.md`](README.md) pro přehled a [`docs/SPECIFIKACE.md`](docs/SPECIFIKACE.md) pro plnou
funkční specifikaci. Tento soubor je o tom, **jak** na téhle větvi (a jejích potomcích) pracovat.

## React Router v7 (RR7) reimplementace — `app-rr` / `stena-app-rr-d1sql`

Vedle Next.js řetězce popsaného níže existuje **paralelní, nezávislý pár větví** pro
reimplementaci frontendu v React Router v7 (Vite, Cloudflare Workers nativně přes
`@cloudflare/vite-plugin` — bez OpenNextu):

- `app-rr` — DB-agnostická základna (obdoba `app` níže), ale na React Router v7 místo Next.js.
  Historicky vychází z `app`, ale dál se s Next.js řetězcem nijak nemerguje ani nesynchronizuje —
  jde o oddělenou stack, ne o náhradu za `app` v hlavním řetězci.
- `stena-app-rr-d1sql` — nasaditelná D1/Cloudflare Workers varianta `app-rr` (obdoba
  `stena-d1sql`, ale pro RR7 stack — `workers/app.ts` + `vite.config.ts` místo OpenNextu).

**Když děláš změny v RR implementaci, používej výhradně tenhle pár, ne `app`/`d1sql`/
`stena-d1sql`** (ty zůstávají samostatně udržovaný Next.js stack). Postup stejný jako u hlavního
řetězce: implementuj a ověř na `app-rr`, pak merguj do `stena-app-rr-d1sql` a znovu ověř —
typecheck, lint, a pro `stena-app-rr-d1sql` navíc reálný `npm run build` + `wrangler dev` proti
lokální D1 s aplikovanými migracemi (`wrangler d1 migrations apply stena-tisnov-db-dev --local`).
`wrangler deploy --dry-run` sám o sobě neodhalí všechny problémy — několik reálných chyb (wasm
resolution, `__dirname` ve workerd, rozbitý SSR bundle) se projevilo až při skutečném buildu/
requestu, viz historie commitů na `stena-app-rr-d1sql`.

`stena-app-rr-d1sql` momentálně sdílí `wrangler.jsonc`'s `name` (`stena-tisnov-dev`) se
`stena-d1sql` — reálné nasazení by přepsalo jeho běžící Workers deployment. Před ostrým nasazením
přejmenovat.

Push do `app-rr` nebo `stena-app-rr-d1sql` **jen na výslovnou žádost v daném tahu** — stejné
pravidlo jako pro zbytek řetězce (viz níže), ale tady obzvlášť: dokud si tenhle stack spolu
neprojdeme, nepushovat automaticky ani po dokončení a ověření změny.

## Architektura větví a propagace změn

Tahle větev (`app`) obsahuje celou aplikaci (UI, server actions, byznys logika, auth, i18n) **bez**
konkrétního DB klienta. Z ní se odvozují DB větve (`d1sql`, `libsql`, `libsql-local`), z těch pak
finální nasaditelné `stena-*` větve (`stena-d1sql`, `stena-libsql`, `stena-libsql-local`), a nakonec
`stena-d1sql-prod`. Standardní postup u každé změny:

1. Implementuj a ověř na `app`.
2. Merguj postupně dolů řetězem: `libsql-local` → `d1sql` → `stena-libsql-local` → `stena-d1sql`.
   Na každé větvi po mergi znovu ověř (viz níže). `libsql-local` slouží jen k rychlému lokálnímu
   ověření v prohlížeči (SQLite, žádné cloud bindingy) — reálně nasazená/používaná je jen D1
   (Cloudflare) větev.
3. `libsql`/`stena-libsql` (self-hosted Fly.io/Docker varianta) se **neudržují automaticky** —
   momentálně se nikde nepoužívají. Merguj do nich **jen na výslovnou žádost** v daném tahu, ne
   jako součást běžné propagace.
4. `stena-d1sql-prod` se merguje a pushuje **jen na výslovnou žádost** v daném tahu — nikdy
   automaticky jako součást běžné propagace.
5. Nikam se nepushuje bez výslovné žádosti v daném tahu (ani `git push`, ani prod).
6. Po `git push` větve `stena-d1sql-prod` (prod) vždy hned spusť
   `npm run cf:deploy` v dané větvi, aby se změny reálně nasadily na Cloudflare — nasazení už
   neběží automaticky přes Cloudflare Git integraci, uživatel buildí lokálně. Platí jen pro tyto
   dvě D1 větve (mají `wrangler.jsonc`); `libsql`/`libsql-local` větve žádné nasazení nemají.
7. Po `git push` vetve stena-d1sql nespostej `npm run cf:deploy`, ten si spoustim rucne pred push

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
D1 větvi, zkontroluj, jestli dané volání někde jinde v kódu běží i s jiným tvarem `data` objektu.

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

## Tištěné návody (docs/navod-clenove.pdf, docs/navod-staff.pdf)

Existují jen na `stena-d1sql`/`stena-d1sql-prod` (přidány přímo tam, ne přes `app`). Jsou to ruční
vizuální kopie obsahu `/navod` (členové) a `/navod-staff` (obsluha) stránek — ne generované z nich
automaticky. Sdílený vzhled (barvy, fonty Noto Sans/Noto Serif, badge/pilulky/tip-box, layout) žije
v `docs/_pdf_common.py`; oba generátory (`docs/generate-navod-pdf.py`,
`docs/generate-navod-staff-pdf.py`) z něj čerpají — **při úpravě stylu edituj `_pdf_common.py`**,
ne oba skripty zvlášť, ať se vizuál nerozejde.

**Při každé změně obsahu `/navod` nebo `/navod-staff`** přegeneruj odpovídající PDF, ať zůstanou
v souladu:

1. Uprav odpovídající text i v `docs/generate-navod-pdf.py` / `docs/generate-navod-staff-pdf.py`
   (funkce `build_body()` — ručně udržovaná kopie, žádné sdílené zdroje s TSX/i18n).
2. Spusť `python3 docs/generate-navod-pdf.py` a/nebo `python3 docs/generate-navod-staff-pdf.py`
   (vyžaduje `pip install weasyprint qrcode` a fonty Noto Sans/Noto Serif nainstalované systémově)
   — přepíše příslušné PDF.
3. Commitni změněné `.py` i `.pdf` soubory na `stena-d1sql`, pak merguj do `stena-d1sql-prod`
   stejně jako ostatní změny.

Nezavádět žádný jiný vizuální styl bez výslovné žádosti.

## Prostředí

- Pracovní adresář je někdy vidět jako jiná cesta než `/home/jirik/stena-letnak/stena-letnak` —
  pokud git hlásí "not a git repository", ověř `pwd`/`ls` a přepni se tam.
