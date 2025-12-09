import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import * as mysql from 'mysql2/promise';

export class RyzeScraperLogger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ryze Scraper Logger',
		name: 'ryzeScraperLogger',
		icon: { light: 'file:ryzeScraperLogger.svg', dark: 'file:ryzeScraperLogger.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Log scraper execution metrics to MySQL',
		defaults: {
			name: 'Ryze Scraper Logger',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'mySql',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Database',
				name: 'database',
				type: 'string',
				required: true,
				default: 'backoffice',
				description: 'MySQL database name',
				placeholder: 'backoffice',
			},
			{
				displayName: 'Table',
				name: 'table',
				type: 'string',
				required: true,
				default: 'scraper_execution_logs',
				description: 'Table name for storing execution logs',
				placeholder: 'scraper_execution_logs',
			},
			{
				displayName: 'Script ID',
				name: 'scriptId',
				type: 'number',
				required: true,
				default: '',
				description: 'Scraper script ID',
				placeholder: '3001',
			},
			{
				displayName: 'Execution Mode',
				name: 'executionMode',
				type: 'options',
				options: [
					{ name: 'Auto-detect', value: 'auto' },
					{ name: 'Regular', value: 'regular' },
					{ name: 'Monthly', value: 'monthly' },
				],
				default: 'auto',
				description: 'Execution mode - auto-detect from input or specify manually',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Fail on Error',
						name: 'failOnError',
						type: 'boolean',
						default: false,
						description: 'Whether to fail the workflow if logging fails',
					},
					{
						displayName: 'Verbose Logging',
						name: 'verboseLogging',
						type: 'boolean',
						default: false,
						description: 'Whether to log detailed information to console',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		// Get parameters
		const scriptId = this.getNodeParameter('scriptId', 0) as number;
		const database = this.getNodeParameter('database', 0) as string;
		const table = this.getNodeParameter('table', 0) as string;
		const executionMode = this.getNodeParameter('executionMode', 0) as string;
		const options = this.getNodeParameter('options', 0, {}) as {
			failOnError?: boolean;
			verboseLogging?: boolean;
		};

		const results: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const input = items[i].json;

			try {
				// Extract data from Ryze Pixel Sender output
				const summary = (input.summary || {}) as any;
				const execution = (input.execution || {}) as any;

				// Determine execution mode
				let mode = executionMode;
				if (mode === 'auto') {
					mode = execution.mode || 'regular';
				}

				// Determine status
				const status = summary.pixel_failed > 0 ? 'failed' : 'success';

				// Prepare log data
				const logData = {
					script_id: scriptId,
					execution_mode: mode,
					status: status,
					items_processed: summary.total_input || 0,
					pixel_new: summary.new_items || 0,
					pixel_duplicates: summary.exact_duplicates || 0,
					pixel_updated: summary.updated_items || 0,
					event_summary: JSON.stringify(summary.event_summary || {}),
				};

				if (options.verboseLogging) {
					this.logger.info('Ryze Scraper Logger - Logging data:', logData);
				}

				// Insert to MySQL
				await insertLog(this, database, table, logData);

				// Return success
				results.push({
					json: {
						success: true,
						logged_at: new Date().toISOString(),
						script_id: scriptId,
						log_data: logData,
					},
					pairedItem: i,
				});
			} catch (error) {
				if (options.failOnError) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to log execution: ${error.message}`,
						{
							itemIndex: i,
						},
					);
				}

				this.logger.error('Ryze Scraper Logger - Error:', error);

				results.push({
					json: {
						success: false,
						error: error.message,
						script_id: scriptId,
					},
					pairedItem: i,
				});
			}
		}

		return [results];
	}
}

async function insertLog(
	executeFunctions: IExecuteFunctions,
	database: string,
	table: string,
	logData: any,
): Promise<void> {
	const credentials = await executeFunctions.getCredentials('mySql');

	const connection = await mysql.createConnection({
		host: credentials.host as string,
		port: credentials.port as number,
		database: database,
		user: credentials.user as string,
		password: credentials.password as string,
	});

	try {
		const query = `
			INSERT INTO ${database}.${table}
				(script_id, execution_mode, status, items_processed, pixel_new, pixel_duplicates, pixel_updated, event_summary)
			VALUES
				(?, ?, ?, ?, ?, ?, ?, ?)
		`;

		await (connection as any).execute(query, [
			logData.script_id,
			logData.execution_mode,
			logData.status,
			logData.items_processed,
			logData.pixel_new,
			logData.pixel_duplicates,
			logData.pixel_updated,
			logData.event_summary,
		]);
	} finally {
		await connection.end();
	}
}
