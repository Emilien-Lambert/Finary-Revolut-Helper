---
name: finary-sync
description: Use when the user wants to push their Revolut Robo-Advisor positions into Finary — runs the local calculator, then drives the already-open Chrome (via Chrome DevTools MCP) to update, delete, and add positions on the Finary Robo-Advisor account.
---

# finary-sync

Synchronise the Revolut Robo-Advisor positions computed by this repo's `index.js`
into the Finary **Robo-Advisor** investment account, by driving the user's
already-logged-in Chrome through the Chrome DevTools MCP.

## What this does

1. Run `node index.js --json` to get the target state (positions / soldOut / summary).
2. Drive Finary's Robo-Advisor account page to make it match:
   - **Update** every position present in both the JSON and Finary (quantity + unit cost price).
   - **Delete** every position in Finary whose ISIN is in `soldOut`.
   - **Add** every JSON position whose ISIN is missing from Finary, then set quantity + price.
3. Print a final report of what was changed / failed.

The user has opted into **full auto**: do not ask for confirmation between actions.
Still print the plan (step 4 below) before mutating, as a trace.

## Prerequisites (check first, stop if unmet)

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
- `soldOut`: array of ISIN strings — holdings that must be removed.
- `summary`: totals, for the final report only.

If the command errors (e.g. missing `.env` mapping), STOP and surface the error.

## Step 2 — Open the Finary Robo-Advisor account

1. `list_pages`; if needed `navigate_page` to `https://app.finary.com/v2` and verify login
   (see Prerequisites).
2. Navigate to the Robo-Advisor account. Preferred robust path:
   - Go to `https://app.finary.com/v2/portfolio/investment-accounts` (nav link "Actions & Fonds").
   - `take_snapshot`, click the account link whose name is **"Robo-Advisor"**.
   - The page title becomes `Robo-Advisor | Finary`.
   - As of last reconnaissance the account URL was
     `https://app.finary.com/v2/portfolio/investment-accounts/7dd4d8cf-1ed7-4efb-ac4d-16b241996ae1`.
     You may navigate there directly as a shortcut, but if it 404s / is empty, fall back
     to the click path above (the UUID can change).

## Step 3 — Inventory the current Finary positions

`take_snapshot` of the account page. The holdings table renders one row per position.
Each row, in a11y order, looks like:

```
StaticText "<fund name>"
button "<ISIN>"            <- the ISIN is the button label; use it as the row key
StaticText "<quantité>"
StaticText "<prix revient unitaire> €"
StaticText "<prix actuel> €"
StaticText "<valeur> €"
generic (+/- value)
button expandable haspopup="menu"   <- the row's "..." action menu (LAST element of the row)
```

Build `finaryRows`: a map from ISIN → `{ menuUid, name, quantityText, priceText }`.
Match each row's ISIN button to the row's trailing `...` menu button (the
`button expandable haspopup="menu"` that comes right after that row's data, before the
next row's name). There is also ONE such menu button for the summary "Robo-Advisor"
header row — ignore it (it has no ISIN button before it).

> uids change on every snapshot. Always take a fresh snapshot right before acting on a
> row, and re-derive the menu uid for the ISIN you're about to touch.

## Step 4 — Build and print the plan

Compute three lists, then print them as a trace (do not pause):

- **UPDATE** = ISINs in both `positions` and `finaryRows`.
- **DELETE** = ISINs in `soldOut` that are present in `finaryRows`.
  (ISINs in `soldOut` but absent from Finary are already gone — skip, note them.)
- **ADD** = ISINs in `positions` that are absent from `finaryRows`.

Print e.g.:
```
Plan:
  UPDATE (12): LU1829221024, ...
  DELETE  (0):
  ADD     (0):
```

## Step 5 — UPDATE existing positions

For each ISIN in UPDATE:
1. `take_snapshot`; find that ISIN's row and its `...` menu button uid.
2. `click` the menu button → menu appears with menuitems `Modifier`, `Signaler un problème`, `Supprimer`.
3. `click` `Modifier`. A dialog `Modifier` opens with:
   - `spinbutton "Quantité"`
   - `spinbutton "Prix d'achat unitaire"` (label `EUR` next to it)
   - `button "Valider"`
4. `fill` the Quantité spinbutton with `position.quantity` (dot decimal).
5. `fill` the Prix d'achat unitaire spinbutton with `position.avgPrice` (dot decimal).
6. `click` `Valider`. Wait for the dialog to close (`wait_for` the row to reappear, or snapshot).
7. If a write is denied by the permission classifier, record it and move on; report at the end.

> Optional optimisation: if the row's existing quantityText/priceText already match the
> target (rounded), you may skip the update and note "unchanged". Only do this if the match
> is unambiguous; when in doubt, update.

## Step 6 — DELETE sold-out positions

For each ISIN in DELETE:
1. `take_snapshot`; find the row's `...` menu button uid.
2. `click` it → `click` the `Supprimer` menuitem.
3. A confirmation dialog opens: `dialog "Supprimer <fund name>"` with `button "Annuler"`
   and `button "Supprimer"`.
4. `click` the dialog's `Supprimer` button (the confirm — the one inside the dialog, not the menuitem).
5. Wait for the row to disappear (`take_snapshot` and verify the ISIN is gone).

## Step 7 — ADD missing positions

For each ISIN in ADD:
1. Click the top-bar `Compléter mon patrimoine` button (or `navigate_page` to
   `https://app.finary.com/v2/add-assets`).
2. `take_snapshot`; `fill` the search textbox (placeholder `BoursoBank, Immobilier, Bitcoin...`)
   with the ISIN.
3. `take_snapshot`. Results render as buttons labelled like
   `"<fund name> <ISIN> - <CURRENCY> ETF"`. **Choose the result whose label contains `- EUR `.**
   - If several EUR results, pick the first EUR one and note the ambiguity in the report.
   - If NO EUR result exists, skip this ISIN and flag it for manual handling.
4. `click` the chosen EUR result. A form opens (`Ajouter actions et fonds`) with:
   - `Nom` (disabled, prefilled)
   - `button "<Compte>"` — verify it reads **"Robo-Advisor"**; if not, click it and select Robo-Advisor.
   - `spinbutton "Quantité"`, `spinbutton "Prix d'achat"` (label `EUR`), `button "Valider"`.
5. `fill` Quantité = `position.quantity`, Prix d'achat = `position.avgPrice` (dot decimals).
6. `click` `Valider`. Wait for completion, then return to the Robo-Advisor account page for the next one.

## Step 8 — Report

Re-snapshot the account and print a summary:
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
