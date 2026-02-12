# Finary Revolut Bridge

Calculate the average purchase price of your Revolut stocks and ETFs for easy import into [Finary](https://finary.com).

## Problem

Finary does not offer native integration with Revolut. To manually add your positions, you need to know the **average purchase price** and **total quantity** of each asset. This script automates that calculation.

## Requirements

- [Node.js](https://nodejs.org) (v18 or higher)

## Installation

```bash
npm install
```

## Setup

1. Export your transaction history from Revolut (CSV file)
2. Export your Revolut account statement (PDF file) to get the ISIN codes
3. Place the files in the `documents/` folder
4. Copy `.env.example` to `.env` and update with your tickers:

```bash
cp .env.example .env
```

5. Edit `.env` with your ticker to ISIN mappings (found in the PDF under "EUR Portfolio breakdown")

## Usage

```bash
npm start
```

## Output

The script displays for each asset:
- ISIN code
- Total quantity
- Average purchase price (in EUR)

```
Average purchase prices:
========================
IE00BCRY6003 - 8.10661844 - 76.04 EUR
IE00BM67HT60 - 12.02236582 - 84.31 EUR
...
```

## Configuration

The `.env` file contains the ticker to ISIN mapping:

```
TICKER_IS3K=IE00BCRY6003
TICKER_XDWT=IE00BM67HT60
# Add your tickers here
```

Find ISIN codes in your Revolut PDF statement (section "EUR Portfolio breakdown").

## License

MIT
