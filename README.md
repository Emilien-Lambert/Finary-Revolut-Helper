# Finary Revolut Bridge

Calculate the average purchase price of your Revolut stocks and ETFs and push them into [Finary](https://finary.com).

## Problem

Finary has no native Revolut integration. To add your positions manually you need the
**average purchase price** and **total quantity** of each asset. This project computes
them from your Revolut export — and, if you use Claude Code, fills Finary for you.

---

## ⚡ TL;DR — with Claude Code

Drop your Revolut **CSV** (transaction history) and **PDF** (account statement) into
`documents/`, then run the two skills in order:

1. **`/finary-env-builder`** — reads the PDF's *"EUR Portfolio breakdown"* table and merges
   every `TICKER → ISIN` couple into `.env` (additive — it never erases existing tickers).
   It then tells you if any ticker from the CSV is still missing an ISIN.

2. **`/finary-sync`** — runs the calculator, opens Finary in your browser (Chrome DevTools
   MCP), goes to **Patrimoine → Actions & Fonds → Robo-Advisor**, and makes it match your
   real positions: **updates** quantities/prices, **deletes** fully-sold lines, and **adds**
   any missing line (searching by ISIN and picking the EUR listing).

**Prerequisite for `finary-sync`:** be logged into Finary in the browser the Chrome
DevTools MCP controls.

---

## 🛠️ Manual version (no Claude Code)

### Requirements

- [Node.js](https://nodejs.org) (v18 or higher)

### Install

```bash
npm install
```

### Setup

1. Export your transaction history from Revolut (**CSV**).
2. Export your Revolut account statement (**PDF**) to get the ISIN codes.
3. Put both files in the `documents/` folder.
4. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
5. Edit `.env` with your `ticker → ISIN` mappings (found in the PDF under
   *"EUR Portfolio breakdown"*).

### Run

```bash
npm start
```

It prints, for each asset, the ISIN, total quantity and average purchase price (EUR),
plus the fully-sold positions and a summary — ready to type into Finary by hand:

```
Average purchase prices:
========================
IE00BCRY6003 - 8.10661844 - 76.04 EUR
IE00BM67HT60 - 12.02236582 - 84.31 EUR
...

Fully sold (set to 0 in Finary):
================================
LU0274209740 - 0.00000000 - SOLD
...

Summary:
========
Total invested:      6944.10 EUR
Total sold:          10.00 EUR
Net contributions:   6934.10 EUR
Total dividends:     38.63 EUR
Total fees:          36.99 EUR
```

JSON output (used by the `finary-sync` skill) is available with:

```bash
node index.js --json
```

## Configuration & the `.env` ticker list

The `.env` file maps each Revolut ticker to its ISIN:

```
TICKER_IS3K=IE00BCRY6003
TICKER_XDWT=IE00BM67HT60
# Add your tickers here
```

> ⚠️ **Keep growing this list over time — never trim it.** The Revolut PDF's
> *"EUR Portfolio breakdown"* only lists the ISINs of the positions you **currently hold**.
> Once you sell out of an asset, Revolut stops listing its ISIN, even though it still
> appears (by ticker, without ISIN) in your transaction history. So each statement only
> lets you map your *current* holdings — you must accumulate the mappings month after month
> to keep ISINs for assets you no longer hold. `/finary-env-builder` does this merge for
> you; if you do it by hand, only ever **add** lines.

> 💬 **Lost an ISIN for an old ticker?** You can ask **Revolut in-app support chat** for the
> ISIN of a specific position directly — they'll give it to you.

## License

MIT
