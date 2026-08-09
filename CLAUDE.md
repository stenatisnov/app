# Stěna Letňák Tišnov — pokyny pro Claude

`main` je jen minimální kořen — tady se nikdy neimplementuje. Skutečná práce probíhá na `app`
(celá appka, bez DB klienta) a odtud se propaguje dál. Viz [`README.md`](README.md) pro tabulku
větví a přehled funkcí.

## Kam pro co

- Implementace, byznys logika, UI, i18n → branch `app` (má vlastní `CLAUDE.md` s detaily
  o D1/libsql divergenci, migracích a ověřovacím postupu).
- Nasaditelné varianty → `stena-d1sql`, `stena-libsql`, `stena-libsql-local`, `stena-d1sql-prod`
  (každá má vlastní `README.md` s návodem na instalaci/nasazení).

## Propagace změn

Standardní směr: `app` → `libsql-local` → `libsql` → `d1sql` → `stena-libsql-local` →
`stena-libsql` → `stena-d1sql`. `main` do tohoto řetězce nepatří a nic se do něj nemerguje zpět.
`stena-d1sql-prod` se merguje/pushuje jen na výslovnou žádost v daném tahu, nikdy automaticky.
Nikam se nepushuje bez výslovné žádosti v daném tahu.
