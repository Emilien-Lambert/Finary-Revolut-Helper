#!/usr/bin/env node

import 'dotenv/config';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCUMENTS_DIR = join(__dirname, 'documents');

const loadTickerToIsin = () => {
	const mapping = {};

	for (const [key, value] of Object.entries(process.env)) {
		if (key.startsWith('TICKER_')) {
			const ticker = key.replace('TICKER_', '');
			mapping[ticker] = value;
		}
	}

	return mapping;
};

const tickerToIsin = loadTickerToIsin();

const parseCSV = (csvPath) => {
	const content = readFileSync(csvPath, 'utf8');
	const lines = content.trim().split('\n');
	const header = lines[0].split(',');

	const transactions = [];

	for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
		const values = lines[lineIndex].split(',');
		const row = {};

		for (let columnIndex = 0; columnIndex < header.length; columnIndex++) {
			row[header[columnIndex]] = values[columnIndex];
		}

		// Only keep buy transactions with a ticker
		if (row.Ticker && row.Type && row.Type.includes('BUY')) {
			transactions.push({
				ticker: row.Ticker,
				quantity: parseFloat(row.Quantity),
				pricePerShare: parseFloat(row['Price per share'].replace('€', '').replace('EUR ', '')),
				totalAmount: parseFloat(row['Total Amount'].replace('€', '').replace('EUR ', ''))
			});
		}
	}

	return transactions;
};

const calculateAveragePrices = (transactions) => {
	const tickerStats = {};

	for (const transaction of transactions) {
		const { ticker } = transaction;

		if (!tickerStats[ticker]) {
			tickerStats[ticker] = {
				totalQuantity: 0,
				totalAmount: 0
			};
		}

		tickerStats[ticker].totalQuantity += transaction.quantity;
		tickerStats[ticker].totalAmount += transaction.totalAmount;
	}

	// Calculate average price for each ticker and return complete stats
	const result = {};

	for (const ticker in tickerStats) {
		const stats = tickerStats[ticker];
		result[ticker] = {
			averagePrice: stats.totalAmount / stats.totalQuantity,
			totalQuantity: stats.totalQuantity
		};
	}

	return result;
};

const main = () => {
	if (Object.keys(tickerToIsin).length === 0) {
		console.error('No ticker mapping found. Please create a .env file with TICKER_* variables.');
		console.error('See .env.example for reference.');
		process.exit(1);
	}

	if (!existsSync(DOCUMENTS_DIR)) {
		console.error('Documents folder not found:', DOCUMENTS_DIR);
		process.exit(1);
	}

	const files = readdirSync(DOCUMENTS_DIR);
	const csvFile = files.find(file => file.endsWith('.csv'));

	if (!csvFile) {
		console.error('No .csv file found in:', DOCUMENTS_DIR);
		process.exit(1);
	}

	const csvPath = join(DOCUMENTS_DIR, csvFile);

	try {
		const transactions = parseCSV(csvPath);
		const results = calculateAveragePrices(transactions);

		// Check that all tickers have a corresponding ISIN
		const missingTickers = Object.keys(results).filter(ticker => !tickerToIsin[ticker]);

		if (missingTickers.length > 0) {
			console.error('Missing ISIN mappings in .env file:');
			missingTickers.forEach(ticker => console.error(`  - TICKER_${ticker}=<ISIN_CODE>`));
			process.exit(1);
		}

		console.log('Average purchase prices:');
		console.log('========================');

		for (const ticker in results) {
			const isin = tickerToIsin[ticker];
			const avgPrice = results[ticker].averagePrice.toFixed(2);
			const totalQuantity = results[ticker].totalQuantity.toFixed(8);
			console.log(`${isin} - ${totalQuantity} - ${avgPrice} EUR`);
		}

	} catch (error) {
		console.error('Error during processing:', error.message);
		process.exit(1);
	}
};

main();
