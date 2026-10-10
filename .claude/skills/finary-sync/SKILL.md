---
name: finary-sync
description: Use when the user wants to check whether Finary is up to date with their Revolut documents, or push their Revolut Robo-Advisor positions into Finary — runs the local calculator, compares it with the Finary account read through the Finary MCP, stops if nothing differs, otherwise drives the already-open Chrome (via Chrome DevTools MCP) to update, delete, and add only the differing positions.
---

# finary-sync

Synchronise the Revolut Robo-Advisor positions computed by this repo's `index.js`
into the Finary **Robo-Advisor** investment account, by driving the user's
already-logged-in Chrome through the Chrome DevTools MCP.

## What this does

1. Run `node index.js --json` to get the target state (positions / soldOut / summary).
2. Read the current Finary Robo-Advisor holdings through the **Finary MCP** (read-only).
3. Diff the two. **If nothing differs, say "Finary est à jour" and STOP** — no browser.
4. Otherwise drive Finary's Robo-Advisor account page to fix only the differing lines:
   - **Update** positions whose quantity or unit cost price differs.
   - **Delete** positions in Finary whose ISIN is in `soldOut`.
   - **Add** JSON positions whose ISIN is missing from Finary.
5. Re-read Finary through the MCP and print a final report.

If the user only asks "is Finary up to date?", stop after step 3 and report the diff.

The user has opted into **full auto**: do not ask for confirmation between actions.
Still print the plan (Step 3) before mutating, as a trace.

## Prerequisites (check first, stop if unmet)

- The Finary MCP is connected (`mcp__finary__accounts` / `mcp__finary__holdings`).
- Write phase only (Steps 4-8):
  - The Chrome DevTools MCP is connected. `list_pages` must succeed.
  - The user is **logged into Finary** in that browser. Navigate to
    `https://app.finary.com/v2` and confirm the page title is `Dashboard | Finary`
    (not `Log in | Finary`). If it shows the login page, STOP and ask the user to log in.
- Permission note: Finary edits are real, irreversible portfolio writes. Claude Code's
  auto-mode classifier may block `click` / `fill` on the edit dialogs. If a write is
  denied, tell the user and let them approve — do not try to bypass the denial.

## Numeric format (important)

Finary's quantity / price fields are spinbuttons. **Fill them with a `.` decimal
separator** (e.g. `13.0674215`, `86.31`) — NOT a comma. The displayed value will
render with a comma, that's expected.

## Step 1 — Compute the target state

Run from the repo root:

```bash
node index.js --json
```

Parse the JSON:
- `positions`: array of `{ isin, quantity, avgPrice }` — the desired holdings.
  `quantity` has 8 decimals, `avgPrice` 2 decimals.
- `soldOut`: array of ISIN strings — holdings that must be removed.
- `summary`: totals, for the final report only.

If the command errors (e.g. `Missing ISIN mappings in .env file`), STOP and surface the
error: a new ticker appeared, run `/finary-env-builder` first. A ticker bought then fully
sold between two statements never appears in the PDF breakdown; its ISIN must be found
elsewhere (not in Finary either, so nothing to delete).

To check another set of documents, point the script at another folder:
`DOCUMENTS_DIR="<abs path>" node index.js --json`.

## Step 2 — Read the current Finary state (Finary MCP, read-only)

1. Call `mcp__finary__accounts`; pick the investment account named **"Robo-Advisor"**
   and take its `id` (last known: `7dd4d8cf-1ed7-4efb-ac4d-16b241996ae1`).
2. Call `mcp__finary__holdings` with that `account_id` (`limit: 1000`; if `meta.has_more`,
   page with `offset`).
3. Build `finary`: ISIN → `{ quantity, buyingPrice }`. Each holding's
   `relationships.security.data.id` points to an `included` security whose
   `attributes.isin` is the key; `attributes.quantity` and `attributes.buying_price` are
   strings with the exact stored values (not rounded like the UI).

## Step 3 — Diff and decide

Compare with exact rules (numbers parsed, then formatted):
- **UPDATE** = ISIN in both, and `quantity.toFixed(8)` differs **or** `avgPrice.toFixed(2)`
  differs from `buyingPrice.toFixed(2)`.
- **DELETE** = ISIN in `soldOut` and present in `finary`.
- **ADD** = ISIN in `positions` and absent from `finary`.
- ISINs in Finary but in neither `positions` nor `soldOut`: do not touch, flag them.

Print the plan, with the old → new values for each UPDATE:
```
Plan:
  UPDATE (1): LU1829221024 qty 13.3513556 -> 14.59614191 | PRU 86.70 -> 88.57
  DELETE (0):
  ADD    (0):
```

**If all three lists are empty: report "Finary est à jour" and STOP.**

## Step 4 — Open the Finary Robo-Advisor account

> UI change (reconnaissance 2026-07): the account no longer opens as its own page.
> It opens as a **modal dialog** overlaid on the portfolio; the page title stays
> `Finary` (NOT `Robo-Advisor | Finary`). The dialog is `dialog "Robo-Advisor"` with
> a tab bar: `Aperçu` (default/selected), `Positions`, `Transactions` (disabled),
> `Analyse`, `Paramètres`. The default `Aperçu` tab shows a chart/overview — NOT the
> holdings list. You must switch to the `Positions` tab (Step 5).

1. `list_pages`; if needed `navigate_page` to `https://app.finary.com/v2` and verify login
   (see Prerequisites).
2. Navigate to the Robo-Advisor account. Preferred robust path:
   - Go to `https://app.finary.com/v2/portfolio/investment-accounts` (nav link "Actions & Fonds").
   - `take_snapshot`, click the account link whose name is **"Robo-Advisor"** — this opens
     the account dialog on the `Aperçu` tab.
   - As of last reconnaissance the account URL was
     `https://app.finary.com/v2/portfolio/investment-accounts/7dd4d8cf-1ed7-4efb-ac4d-16b241996ae1`.
     Navigating there directly also opens the dialog (on `Aperçu`). Use it as a shortcut,
     but if it 404s / is empty, fall back to the click path above (the UUID can change).

## Step 5 — Locate the rows to edit

1. In the `dialog "Robo-Advisor"`, `click` the `tab "Positions"`. The URL gains
   `?tab=holdings` and the holdings table renders (a `searchbox "Rechercher"` and the
   column-header buttons `Nom`, `Quantité`, `PRU`, `Prix de revient`, `Prix actuel`,
   `Valeur`, `+/- value` appear, plus a `StaticText "<N> positions"`).
2. `take_snapshot`. Each holding row, in a11y order, looks like:

```
image / StaticText "<fund name>"
button "<ISIN>"            <- the ISIN is the button label; use it as the row key
StaticText "<quantité>"            (comma decimals, rounded to 4 dp, e.g. "13,0674")
StaticText "<PRU / prix revient unitaire> €"
StaticText "<prix de revient total> €"
StaticText "<prix actuel> €"
StaticText "<valeur> €"
StaticText "<+/- value> €"
image "+" | "-"
StaticText "<pct>%"
button "Actions" expandable haspopup="menu"   <- the row's action menu (LAST element of the row)
```

The values come from Step 2; here you only need, for each ISIN to UPDATE or DELETE,
its row's `button "Actions"` uid.
The row action menu is now a **labelled `button "Actions"`** (previously an unlabelled
`...` button). Match each row's ISIN button to the `button "Actions"` that comes right
after that row's data, before the next row's name. There is NO extra summary-row menu
button now — there is exactly one `button "Actions"` per holding.

> uids change on every snapshot. Always take a fresh snapshot right before acting on a
> row, and re-derive the `Actions` menu uid for the ISIN you're about to touch.

## Step 6 — UPDATE differing positions

For each ISIN in UPDATE:
1. `take_snapshot`; find that ISIN's row and its `button "Actions"` uid.
2. `click` the `Actions` button → `menu "Actions"` appears with menuitems `Modifier`,
   `Signaler un problème`, `Supprimer`.
3. `click` `Modifier`. A dialog `Modifier` opens with (Compte selector may briefly read
   `Loading...` before resolving to the account):
   - `spinbutton "Quantité"`
   - `spinbutton "Prix d'achat unitaire"` (label `EUR` next to it)
   - `button "Valider"`
4. `fill` the Quantité spinbutton with `position.quantity` (dot decimal).
5. `fill` the Prix d'achat unitaire spinbutton with `position.avgPrice` (dot decimal).
6. `click` `Valider`. Wait for the dialog to close (`wait_for` the row to reappear, or snapshot).
7. If a write is denied by the permission classifier, record it and move on; report at the end.

## Step 7 — DELETE sold-out positions

For each ISIN in DELETE:
1. `take_snapshot`; find the row's `button "Actions"` uid.
2. `click` it → `click` the `Supprimer` menuitem.
3. A confirmation dialog opens: `dialog "Supprimer <fund name>"` with `button "Annuler"`
   and `button "Supprimer"`.
4. `click` the dialog's `Supprimer` button (the confirm — the one inside the dialog, not the menuitem).
5. Wait for the row to disappear (`take_snapshot` and verify the ISIN is gone).

## Step 8 — ADD missing positions

For each ISIN in ADD:
1. Click the top-bar `Compléter mon patrimoine` button (or `navigate_page` to
   `https://app.finary.com/v2/add-assets`).
2. `take_snapshot`; `fill` the search textbox (placeholder `BoursoBank, Immobilier, Bitcoin...`)
   with the ISIN.
3. `take_snapshot`. Results render as buttons labelled like
   `"<fund name> <ISIN> - <CURRENCY> ETF"`. **Choose the result whose label contains `- EUR `.**
   - If several EUR results, pick the first EUR one and note the ambiguity in the report.
   - If NO EUR result exists, skip this ISIN and flag it for manual handling.
4. `click` the chosen EUR result. The form loads asynchronously (the first click may only
   focus the result and the SPA then navigates) — after clicking, `take_snapshot` and wait
   for the page title `Ajout d'actions & fonds | Finary`. The form (`StaticText
   "Ajouter actions et fonds"`) has:
   - `textbox "Nom"` (disabled, prefilled)
   - `button "<Compte>"` — as of last recon this **already defaults to "Robo-Advisor"**;
     still verify it, and if not, click it and select Robo-Advisor.
   - `spinbutton "Quantité"`, `spinbutton "Prix d'achat"` (label `EUR`), `button "Valider"`.
5. `fill` Quantité = `position.quantity`, Prix d'achat = `position.avgPrice` (dot decimals).
6. `click` `Valider`. Wait for completion, then return to the Robo-Advisor account page for the next one.

## Step 9 — Verify and report

Re-run Steps 2 and 3 (Finary MCP). The diff must now be empty; list any line still
differing as failed. Then print a summary:
- Updated: N (list ISINs)
- Deleted: N
- Added: N
- Skipped / failed: list with reason (e.g. permission denied, no EUR result, already absent)
- Echo the `summary` totals from the JSON for the user's records.

## Robustness notes

- The Finary UI is a React SPA; uids are per-snapshot. Never reuse a uid across actions —
  re-snapshot before each row operation.
- Close any stray dialog/menu with the `Escape` key (`press_key`).
- If `Compte` ever defaults to a different account, always correct it to "Robo-Advisor"
  before validating an add.
- EUR cash / top-ups are NOT positions and never appear in `positions` — nothing to do for them.
