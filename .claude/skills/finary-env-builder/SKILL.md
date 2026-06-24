---
name: finary-env-builder
description: Use when the user wants to build or refresh the .env ticker→ISIN mappings from their Revolut PDF statement so that index.js has every TICKER_<SYMBOL>=<ISIN> couple it needs. Reads ONLY the PDF "EUR Portfolio breakdown" table, merges into .env (never overwrites), and reports any ticker still missing an ISIN.
---

# finary-env-builder

Populate / refresh the repo's `.env` ticker→ISIN mapping by reading the Revolut
**Account Statement PDF**, so that `index.js` can resolve every symbol it sees in the CSV.

## Two rules that define this skill

1. **Only the "EUR Portfolio breakdown" table matters.** That single table (page 2 of the
   statement) is the *only* place an ISIN is given. The transaction pages and the USD
   tables carry NO usable ISIN — ignore them. You do **not** need to read the whole PDF.

2. **Merge, never overwrite.** The breakdown lists ISINs *only for the positions held at
   the statement date* — already-sold tickers are not in it. Those sold tickers' ISINs
   live in the existing `.env` (carried over from past statements). So always preserve
   every existing `TICKER_*` line and only ADD/refresh from the PDF. Overwriting would
   lose the sold-ticker mappings and break the script's "Fully sold" block.

## Steps

### 1. Read the breakdown table (efficiently — not the whole PDF)
Find the current statement PDF in `documents/*.pdf`. The "EUR Portfolio breakdown" is on
**page 2**. Read just that page:

- Use the Read tool with `pages="2"` to get only that page (cheap). If that errors because
  page-image rendering tooling (poppler/pdftoppm) is missing, fall back to reading the PDF
  **without** the `pages` parameter (text extraction of the whole file) — but still only
  look at the `EUR Portfolio breakdown` section; ignore everything else.

Do NOT process `documents/` history or `old-documents/` — the existing `.env` already
holds the accumulated history. One current PDF is enough.

### 2. Extract Symbol→ISIN from the table
The table looks like:

```
Symbol  Company …                          ISIN           Quantity  Price  Value  % of Portfolio
XDWI    Xtrackers MSCI World Industrials…  IE00BM67HV82   8.827…    €75.62 €667…  8.18%
WELK    Amundi S&P Global Financials ESG…  IE000KYX7IP4   …
…
Positions Value …            <- table ends here
```

For each data row (stop at the `Positions Value` / `Cash value` / `Total` rows):
- **Symbol** = the first token on the row (may be alphanumeric, e.g. `79U0`, `2B72`).
- **ISIN** = the token matching `^[A-Z]{2}[A-Z0-9]{9}[0-9]$` (2 letters, 9 alphanumerics,
  1 check digit — 12 chars). The text between Symbol and ISIN is the fund name (optional comment).

Collect `pdfMappings[SYMBOL] = ISIN`.

### 3. Load the existing .env
Read `.env`. Parse all `TICKER_<SYMBOL>=<ISIN>` lines into `envMappings[SYMBOL] = ISIN`.
Keep the header comment.

### 4. Merge (additive)
- For each `SYMBOL` in `pdfMappings`:
  - Absent in env → **add** `TICKER_<SYMBOL>=<ISIN>`.
  - Present with the same ISIN → leave as-is.
  - Present with a **different** ISIN → keep the existing one, but **flag the conflict** to
    the user (don't silently change a financial identifier).
- **Never delete** an existing `TICKER_*` entry.

### 5. Cross-check against the CSV (the real goal)
Read the CSV in `documents/` (the `*.csv`). Collect every distinct non-empty value in the
`Ticker` column. For each, verify a `TICKER_<SYMBOL>` mapping now exists. Build a
**missing list** of symbols present in the CSV but with no ISIN in the merged map.

### 6. Write .env
Write the merged mapping back to `.env`, one `TICKER_<SYMBOL>=<ISIN>` per line, keeping the
short header comment. Do not touch any other file.

### 7. Report
- Added: new `TICKER_*` lines (symbol → ISIN, with fund name).
- Unchanged: count.
- Conflicts: any symbol whose PDF ISIN differs from the existing env ISIN (show both).
- **Still missing (action needed):** CSV symbols with no ISIN anywhere — the user must add
  these by hand (from an older statement where the ticker was held) as `TICKER_<SYMBOL>=<ISIN>`.

## Verify
Run `node index.js` (no flag). If it prints positions/summary without the
`Missing ISIN mappings in .env file` error, the mapping is complete for the current CSV.
Otherwise surface the tickers it lists (they match the step-5 missing list).

## Notes
- The CSV `Ticker` column uses the same short symbols as the PDF (e.g. `LYMS`, `WELK`).
- `EUR` / cash rows are not securities — never add a `TICKER_EUR`.
- This skill only edits `.env`. To push positions into Finary afterwards, use `finary-sync`.
