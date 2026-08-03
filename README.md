# Stěna Letňák Tišnov

Webová aplikace pro otevírání vstupní brány lezecké stěny — členové se přihlásí, mají kredity
(vstupy) a otevřou bránu tlačítkem. Admin spravuje uživatele, skupiny, ceník, platby, guest
passy, konfiguraci zámku a statistiky.

Tento repozitář je organizovaný po **modulech v git větvích**, ze kterých vznikají tři nasaditelné
varianty lišící se databázovým backendem.

## Struktura větví

| Větev | Obsah |
|---|---|
| `main` | tento minimální kořen |
| `marketing` | veřejná landing page (bez app funkcí) |
| `app` | celá aplikace — UI, server actions, byznys logika, auth, i18n (bez konkrétního DB klienta) |
| `d1sql` | `app` + napojení na **Cloudflare D1** (Workers runtime) |
| `libsql` | `app` + napojení na **Turso** (vzdálený libSQL) |
| `libsql-local` | `app` + napojení na **libSQL nad lokálním souborem** (self-host) |
| **`stena-d1sql`** | `d1sql` + `marketing` — nasaditelná varianta pro Cloudflare |
| **`stena-libsql`** | `libsql` + `marketing` — nasaditelná varianta pro Turso |
| **`stena-libsql-local`** | `libsql-local` + `marketing` — nasaditelná self-host varianta |

Pro běh aplikace se přepněte na jednu z finálních větví (`stena-*`) — každá obsahuje vlastní
`README.md` s návodem na instalaci a nasazení pro danou databázi.

```bash
git checkout stena-libsql-local   # nejjednodušší self-host varianta bez cloud účtu
```

## Funkce

Registrace + schválení adminem, přihlášení (e-mail/heslo, volitelně Google), skupiny s týdenními
časovými okny, kreditový systém s auditním ledgerem, otevření brány (transakčně, s cooldownem a
vrácením kreditu při selhání zámku), nákup balíčků (QR/SPD platba s ručním potvrzením, GoPay),
guest passy, admin sekce (uživatelé, skupiny, ceník, platby, guest passy, nastavení zámku/QR/GoPay,
audit log s CSV exportem, statistiky s grafy a CSV exportem), i18n CS/EN. Podrobnosti v kódu
(business logika v `src/lib/`, server actions v `src/app/actions.ts`) na větvi `app`.
