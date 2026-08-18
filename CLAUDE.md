# Stěna Letňák Tišnov — pokyny pro Claude

`main` je jen minimální kořen — tady se nikdy neimplementuje. Skutečná práce probíhá na `app`
(celá appka, React Router v7, bez konkrétního DB klienta) a odtud se propaguje dál. Viz
[`README.md`](README.md) pro tabulku větví a přehled funkcí.

## Kam pro co

- Implementace, byznys logika, UI, i18n → branch `app` (má vlastní `CLAUDE.md` s detaily
  o D1/PostgreSQL divergenci, migracích a ověřovacím postupu — je to hlavní zdroj pravdy pro
  jakoukoliv práci na této appce, ne tenhle soubor).
- Nasaditelné varianty → `stena-d1sql` (dev, Cloudflare D1), `stena-d1sql-prod` (produkce,
  `stenatisnov.app`), `stena-psql` (dev, PostgreSQL/Docker/Railway) — každá má vlastní
  `README.md`/`CLAUDE.md` s návodem na instalaci, nasazení a ověřování pro danou variantu.

## Propagace změn

Standardní směr: `app` → `stena-d1sql` a zároveň `app` → `stena-psql` (obě nezávisle, nemergují
se mezi sebou). `stena-d1sql-prod` se merguje/pushuje jen na výslovnou žádost v daném tahu, nikdy
automaticky jako součást běžné propagace. `main` do tohoto řetězce nepatří a nic se do něj
nemerguje zpět.

Nikam se nepushuje bez výslovné žádosti v daném tahu — ani `git push`, ani prod. Skutečné nasazení
(`wrangler deploy`, `cf:deploy`) si uživatel spouští sám ručně.
