---
name: finary-sync
description: Use when the user wants to check whether Finary is up to date with their Revolut documents, or push their Revolut Robo-Advisor positions into Finary — runs the local calculator, compares it with the Finary account read through the Finary MCP, stops if nothing differs, otherwise drives the user's logged-in browser to update, delete, and add only the differing positions.
---

# finary-sync

Synchronise the Revolut Robo-Advisor positions computed by this repo's `index.js`
into the Finary **Robo-Advisor** investment account: read Finary through the Finary
MCP, then fix the differing lines by driving the user's logged-in browser.

## What this does

1. Run `node index.js --json` to get the target state (positions / soldOut / summary).
2. Read the current Finary Robo-Advisor holdings through the **Finary MCP** (read-only).
3. Diff the two. **If nothing differs, say "Finary est à jour" and STOP** — no browser.
4. Otherwise drive Finary's Robo-Advisor account page to fix only the differing lines:
   - **Update** positions whose quantity or unit cost price differs.
   - **Delete** positions in Finary whose ISIN is in `soldOut`.
   - **Add** JSON positions whose ISIN is missing from Finary.
5. Re-read Finary through the MCP and print a final report.
6. If the Finary UI no longer matched this file, update this file (see last section).

If the user only asks "is Finary up to date?", stop after step 3 and report the diff.

Print the plan (Step 3) before mutating. Finary edits are real and irreversible
(deletes lose the position's history): get the user's go-ahead on the printed plan
once, then run all its writes without asking again between actions.

## Prerequisites (check first, stop if unmet)

- The Finary MCP is connected (`mcp__finary__accounts` / `mcp__finary__holdings`).
- Write phase only (Steps 4-8):
  - A browser tool is available: the **Claude in Chrome** extension (`mcp__claude-in-chrome__*`,
    the user's Brave) is the usual one. If several browsers are connected, never pick
    one yourself: let the user choose (`switch_browser`). A Chrome DevTools MCP works too,
    with the same steps.
  - The user is **logged into Finary** in that browser. If any Finary URL redirects to
    `/v2/login` (tab title `Se connecter | Finary`), STOP and ask the user to log in:
    never type their credentials.

## Numeric format (important)

Quantity / price fields are number inputs. **Type values with a `.` decimal separator**
(e.g. `13.0674215`, `86.31`), NOT a comma. Prefilled values display with a comma, that's
expected. To replace a prefilled value: click the field, select all (`cmd+a`), then type.

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

## Step 4 — Open the Robo-Advisor positions

> UI as observed on 2026-10-10.

Navigate to
`https://app.finary.com/v2/portfolio/holdings-account/<accountId>?tab=holdings`
(`accountId` from Step 2). This opens the `dialog "Robo-Advisor"` directly on its
`Positions` tab (tabs: `Aperçu`, `Positions`, `Transactions` (disabled), `Analyse`,
`Paramètres`). The tab title stays `Finary`.

The positions table has a `Rechercher` search box, an `+ Ajouter une position` button,
column headers `Nom`, `Quantité`, `PRU`, `Prix de revient`, `Prix actuel`, `Valeur`,
`+/- value`, a `Total <N> positions` row, then one row per holding: fund name, ISIN
under it, the values, and a `…` button (`button "Actions"`) at the far right.

## Step 5 — Target one row: filter by ISIN

Before each UPDATE or DELETE, type the ISIN in the `Rechercher` box (select all first
to replace the previous one). The table then shows `Total 1 position` and that single
row: no risk of acting on the wrong line, and the row stays at the same place.
Check the row's fund name / ISIN before acting. Then click its `…` (`Actions`) button:
a menu opens with `Modifier`, `Signaler un problème`, `Supprimer`.

Positions and uids/refs move after each change: never reuse coordinates or refs
across rows without re-checking the screen.

## Step 6 — UPDATE differing positions

For each ISIN in UPDATE:
1. Filter and open the menu (Step 5), click `Modifier`.
2. A dialog `Modifier` opens: `Nom` (disabled, the fund name), `Compte` (`Robo-Advisor`),
   `Quantité`, `Prix d'achat unitaire` (`EUR`), `Valider`.
3. Replace `Quantité` with `position.quantity` and `Prix d'achat unitaire` with
   `position.avgPrice` (dot decimals).
4. **Check the dialog** (screenshot/zoom): right fund name, both values exact.
5. Click `Valider`. Success toast: `Les modifications ont été enregistrées`.
6. If a write is refused (permission prompt denied, error toast), record it and move on.

## Step 7 — DELETE sold-out positions

For each ISIN in DELETE:
1. Filter and open the menu (Step 5), click `Supprimer` (red).
2. A confirmation `dialog "Supprimer <fund name>"` opens with `Annuler` / `Supprimer`.
   Check the fund name, then click the dialog's `Supprimer`.
3. Success toast: `L'actif a été supprimé`.

## Step 8 — ADD missing positions

For each ISIN in ADD:
1. On the account's Positions tab, click `+ Ajouter une position`. It opens
   `/v2/add-assets/investment-accounts/manually?holdingAccountId=<accountId>`
   (title `Ajout d'actions & fonds | Finary`, heading `Ajouter actions et fonds`).
2. Type the ISIN in the `Chercher actions ou fonds` box. Results show the fund name,
   then `<SYMBOL> - <CURRENCY>` under it, and a type badge (`ETF`, `Action`).
3. **Choose the result whose second line ends with `- EUR`.**
   - Several EUR results: pick the first, note the ambiguity in the report.
   - No EUR result: skip this ISIN and flag it for manual handling.
   - The symbol often matches the Revolut ticker (e.g. `UBUD - EUR`), a useful cross-check.
4. The form shows `Nom` (disabled), `Compte` (already `Robo-Advisor` thanks to the
   `holdingAccountId`; verify it, fix it if not), `Quantité`, `Prix d'achat` (`EUR`),
   `Valider`.
5. Type `position.quantity` and `position.avgPrice` (dot decimals), check, click `Valider`.
6. Success toast `Votre actif a été ajouté`; Finary returns to the account's Positions tab.

## Step 9 — Verify and report

Re-run Steps 2 and 3 (Finary MCP). The diff must now be empty; list any line still
differing as failed. Then print a summary:
- Updated: N (list ISINs)
- Deleted: N
- Added: N (with the search result chosen)
- Skipped / failed: list with reason (e.g. permission denied, no EUR result, already absent)
- Echo the `summary` totals from the JSON for the user's records.

Close any browser tab you opened.

## Robustness notes

- Close any stray dialog/menu with `Escape`.
- If `Compte` ever shows another account, correct it to "Robo-Advisor" before validating.
- EUR cash / top-ups are NOT positions and never appear in `positions` — nothing to do for them.

## Keeping this skill current

Finary's UI changes regularly (the account page already moved from a standalone page
to a dialog, then from `/investment-accounts/` to `/holdings-account/`). The UI described
in Steps 4-8 is a guide, not ground truth: if the screen differs (URL, labels, button
names, menu items, dialog fields, toasts, where a button is), adapt to what is actually
on screen, then **at the end of the run, edit this file** so it describes the UI as
observed, update the "UI as observed on" date, and commit the change. Same for any
other part found outdated (MCP response shape, `index.js` output, file locations).
Tell the user what was corrected.
