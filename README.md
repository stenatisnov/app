# Stěna Letňák Tišnov

Webová aplikace pro otevírání vstupní brány lezecké stěny — členové se přihlásí, mají kredity
(vstupy) a otevřou bránu tlačítkem. Admin spravuje uživatele, skupiny, ceník, platby, guest
passy, konfiguraci zámku a statistiky.

React Router v7 (Vite, Cloudflare Workers nativně přes `@cloudflare/vite-plugin`). Repozitář je
organizovaný po **modulech v git větvích**, ze kterých vznikají nasaditelné varianty lišící se
databázovým backendem.

## Struktura větví

| Větev | Obsah |
|---|---|
| `main` | tento minimální kořen |
| `app` | celá aplikace — UI, server actions, byznys logika, auth, i18n (bez konkrétního DB klienta) |
| `stena-d1sql` | dev nasaditelná varianta pro **Cloudflare D1** (Workers runtime) |
| `stena-psql` | dev nasaditelná varianta pro **PostgreSQL**, spustitelná v kontejneru (Docker), nasazovaná na Railway |
| `stena-d1sql-prod` | produkční D1 varianta, nasazená na `stenatisnov.app` |

Pro vývoj se přepněte na `app` a ověřujte proti `stena-d1sql`/`stena-psql` — viz
[`CLAUDE.md`](CLAUDE.md) pro přesný postup propagace změn mezi větvemi a ověřování a
[`docs/SPECIFIKACE.md`](docs/SPECIFIKACE.md) pro architekturu appky, datový model a klíčové
workflow.

```bash
git checkout stena-psql   # nejjednodušší lokální spuštění: Docker + Postgres, žádný cloud účet
docker compose up
```

## Funkce

Registrace + schválení adminem (věkový gate pod 15/15–17 let, i přes Google), přihlášení
(e-mail/heslo, volitelně Google OAuth — admin-konfigurovatelné), rozvrhy s týdenními časovými
okny, kreditový systém s auditním ledgerem, otevření brány (atomicky, s cooldownem a vrácením
kreditu při selhání zámku), nákup balíčků (QR/SPD platba s ručním nebo automatickým Fio
potvrzením), doprovody (companions), guest passy, admin sekce (uživatelé, rozvrhy, ceník, platby,
guest passy, nastavení zámku/QR/Google/GoPay/Fio/SMTP/S3, audit log s CSV exportem, statistiky
s grafy, export/import dat ve formátu YAML), i18n CS/EN. Podrobnosti v kódu — business logika v
`src/lib/`, server actions v `src/lib/actions/*.ts`.
