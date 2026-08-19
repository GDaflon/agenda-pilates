# Natty Estúdio Pilates — Guia de marca do app

## Nome

- Na UI: **"Natty Pilates"** — "Natty" na cor primária, "Pilates" na cor de texto.
- Por extenso em manifest/títulos/metadata: **"Natty Estúdio Pilates"**.
- Nunca usar "Agenda Pilates".

## Paleta

Todos os tons vivem como tokens no `:root` de `app/globals.css` — nunca hex solto em
componente.

| Token | Valor | Uso |
| --- | --- | --- |
| `--brand` | `#C0267E` | botões, estados ativos, theme-color |
| `--brand-ink` | `#97195F` | texto sobre fundos claros da marca |
| `--brand-soft` | `#F8E3EF` | fundos suaves da marca |
| `--teal` / `--teal-soft` | `#2BA6AF` / `#E0F3F4` | badge **Mensalista** e marcador de fixo |
| `--purple` / `--purple-soft` | `#8B4B9C` / `#F1E7F6` | badge **Wellhub** |
| `--orange` | `#EA580C` | badge **TotalPass** (mantido) |
| `--ink` | `#3A3138` | texto principal |
| `--muted` | `#8B7A84` | texto secundário |
| `--bg` | `#F8F2F5` | fundo do app |
| `--line` | `#EEE0E8` | linhas/bordas |

Não mudam: verde/vermelho de check-in/falta e o cartão verde estilo WhatsApp da tela
de vagas.

## Onde a marca aparece

- `app/layout.tsx` — metadata/viewport (`title`, `themeColor #C0267E`).
- `public/manifest.webmanifest` — nome completo, cores.
- `app/icon.svg` — três pétalas magenta/roxo/teal sobre `#FBF0F6`; é a fonte do símbolo
  e o que o Next serve como ícone da aba. `public/icon-192.png` e `public/icon-512.png`
  (manifest/PWA) são gerados a partir dele; `app/apple-icon.png` é a cópia de 192px que
  o iOS usa na tela de início.
- Os ícones vêm das **convenções de arquivo** do Next (`app/icon.svg`, `app/apple-icon.png`).
  Não declare `metadata.icons` em `app/layout.tsx`: um `icons` explícito substitui a
  metadata gerada pelos arquivos e o ícone da aba some. Pelo mesmo motivo não pode existir
  `public/icon.svg` — ele ocuparia a rota `/icon.svg` e sombrearia o arquivo do `app/`.
- `lib/mensagem.ts` — mensagem de vagas abre com `*Natty Pilates {Unidade}*`.
- Unidades de exemplo: **Centro** e **Jardim** (`supabase/seed.sql` e
  `lib/demoRepo.ts`).
