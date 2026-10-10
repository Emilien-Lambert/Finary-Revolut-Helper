import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HEADER = 'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate';

const run = (documentsDir) => spawnSync('node', ['index.js', '--json'], {
	encoding: 'utf8',
	env: { ...process.env, DOCUMENTS_DIR: documentsDir, TICKER_AAA: 'XX0000000001' }
});

const makeDir = (csv) => {
	const dir = mkdtempSync(join(tmpdir(), 'frh-'));
	if (csv) writeFileSync(join(dir, 'statement.csv'), csv);
	return dir;
};

test('DOCUMENTS_DIR set: reads the CSV from that folder and outputs its positions', () => {
	const dir = makeDir([
		HEADER,
		'2026-01-01T00:00:00Z,,CASH TOP-UP,,,EUR 100,EUR,1',
		'2026-01-02T00:00:00Z,AAA,BUY - MARKET,2,EUR 30,EUR 60,EUR,1'
	].join('\n'));

	const result = run(dir);

	assert.equal(result.status, 0, result.stderr);
	const output = JSON.parse(result.stdout);
	assert.deepEqual(output.positions, [{ isin: 'XX0000000001', quantity: 2, avgPrice: 30 }]);
	assert.equal(output.summary.cashBalance, 40);
});

test('DOCUMENTS_DIR set to a folder without CSV: fails and names that folder', () => {
	const dir = makeDir();

	const result = run(dir);

	assert.equal(result.status, 1);
	assert.match(result.stderr, new RegExp(`No .csv file found in: ${dir}`));
});

test('DOCUMENTS_DIR set to a missing folder: fails with "Documents folder not found"', () => {
	const result = run(join(tmpdir(), 'frh-does-not-exist'));

	assert.equal(result.status, 1);
	assert.match(result.stderr, /Documents folder not found/);
});
