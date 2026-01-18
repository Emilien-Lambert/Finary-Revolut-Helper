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

		const type = row.Type || '';
		const totalAmount = parseFloat((row['Total Amount'] || '0').replace('€', '').replace('EUR ', ''));

		// Keep BUY and SELL transactions with a ticker
		// TODO: Vérifier si le type exact pour les ventes est bien 'SELL' dans le CSV Revolut
		if (row.Ticker && (type.includes('BUY') || type.includes('SELL'))) {
			transactions.push({
				ticker: row.Ticker,
				type: type.includes('BUY') ? 'BUY' : 'SELL',
				quantity: parseFloat(row.Quantity),
				pricePerShare: parseFloat(row['Price per share'].replace('€', '').replace('EUR ', '')),
				totalAmount: totalAmount
			});
		}

		// Track dividends
		if (type === 'DIVIDEND') {
			transactions.push({
				type: 'DIVIDEND',
				ticker: row.Ticker || null,
				totalAmount: totalAmount
			});
		}

		// Track robo management fees
		if (type === 'ROBO MANAGEMENT FEE') {
			transactions.push({
				type: 'FEE',
				totalAmount: totalAmount
			});
		}

		// Track cash top-ups
		if (type === 'CASH TOP-UP') {
			transactions.push({
				ticker: 'EUR',
				type: 'BUY',
				quantity: totalAmount,
				pricePerShare: 1,
				totalAmount: totalAmount
			});
		}
	}

	return transactions;
};

const calculateAveragePrices = (transactions) => {
	const tickerStats = {};
	let totalInjected = 0;
	let totalSold = 0;
	let totalDividends = 0;
	let totalFees = 0;

	for (const transaction of transactions) {
		const { ticker, type } = transaction;

		// Handle Cash Top-ups (BUY EUR)
		if (ticker === 'EUR' && type === 'BUY') {
			// We consider Cash Top-up as the "Injected" capital into the platform
			totalInjected += transaction.totalAmount;
			continue;
		}

		if (type === 'DIVIDEND') {
			totalDividends += transaction.totalAmount;
			continue;
		}

		if (type === 'FEE') {
			totalFees += Math.abs(transaction.totalAmount);
			continue;
		}

		if (!tickerStats[ticker]) {
			tickerStats[ticker] = {
				boughtQuantity: 0,
				soldQuantity: 0,
				totalBoughtAmount: 0
			};
		}

		if (type === 'BUY') {
			tickerStats[ticker].boughtQuantity += transaction.quantity;
			tickerStats[ticker].totalBoughtAmount += transaction.totalAmount;
		} else if (type === 'SELL') {
			tickerStats[ticker].soldQuantity += transaction.quantity;
			totalSold += transaction.totalAmount;
		}
	}

	// Calculate average price for each ticker and return complete stats
	const result = {};

	for (const ticker in tickerStats) {
		const stats = tickerStats[ticker];
		const currentQuantity = stats.boughtQuantity - stats.soldQuantity;

		// Only include tickers with remaining positions
		if (currentQuantity > 0) {
			result[ticker] = {
				averagePrice: stats.totalBoughtAmount / stats.boughtQuantity,
				totalQuantity: currentQuantity
			};
		}
	}

	return { positions: result, totalInjected, totalSold, totalDividends, totalFees };
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
		const { positions, totalInjected, totalSold, totalDividends, totalFees } = calculateAveragePrices(transactions);

		// Check that all tickers have a corresponding ISIN
		const missingTickers = Object.keys(positions).filter(ticker => !tickerToIsin[ticker]);

		if (missingTickers.length > 0) {
			console.error('Missing ISIN mappings in .env file:');
			missingTickers.forEach(ticker => console.error(`  - TICKER_${ticker}=<ISIN_CODE>`));
			process.exit(1);
		}

		console.log('Average purchase prices:');
		console.log('========================');

		for (const ticker in positions) {
			const isin = tickerToIsin[ticker];
			const avgPrice = positions[ticker].averagePrice.toFixed(2);
			const totalQuantity = positions[ticker].totalQuantity.toFixed(8);
			console.log(`${isin} - ${totalQuantity} - ${avgPrice} EUR`);
		}

		const netContributions = totalInjected - totalSold;

		console.log('');
		console.log('Summary:');
		console.log('========');
		console.log(`Total invested:      ${totalInjected.toFixed(2)} EUR`);
		console.log(`Total sold:          ${totalSold.toFixed(2)} EUR`);
		console.log(`Net contributions:   ${netContributions.toFixed(2)} EUR`);
		console.log(`Total dividends:     ${totalDividends.toFixed(2)} EUR`);
		console.log(`Total fees:          ${totalFees.toFixed(2)} EUR`);

	} catch (error) {
		console.error('Error during processing:', error.message);
		process.exit(1);
	}
};

main();
