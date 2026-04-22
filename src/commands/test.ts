import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, requireOrgId, requireToken } from '../lib/config.js';
import { loadProjectConfig } from '../lib/files.js';

function getClient(apiUrl: string | undefined) {
  const token = requireToken();
  const orgId = requireOrgId();
  return new RivalApiClient(apiUrl ?? getApiUrl(), token, orgId);
}

function parseEventData(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.error(chalk.red('Error: ') + '--data must be valid JSON');
    process.exit(1);
  }
}

export function createTestCommand(): Command {
  const command = new Command('test');
  command.description('Create test events for a Rival function');

  // rival test [single]
  command
    .command('create', { isDefault: true })
    .description('Send a single test event to a function')
    .option('-f, --function-id <id>', 'Function ID (falls back to rival.json)')
    .option('-n, --event-name <name>', 'Event name (e.g. user.signup)')
    .option('-V, --version <version>', 'Function version (falls back to rival.json, then "Draft")')
    .option('-i, --event-id <id>', 'Optional event ID')
    .option('-d, --data <json>', 'Event data as JSON string (e.g. \'{"key":"val"}\')')
    .option('-u, --api-url <url>', 'Override API base URL')
    .option('--cwd <dir>', 'Working directory for rival.json lookup')
    .action(async (options: {
      functionId?: string;
      eventName?: string;
      version?: string;
      eventId?: string;
      data?: string;
      apiUrl?: string;
      cwd?: string;
    }) => {
      const workDir = options.cwd ?? process.cwd();
      try {
        const projectConfig = loadProjectConfig(workDir);

        const functionId = options.functionId ?? projectConfig?.functionId;
        if (!functionId) {
          console.error(chalk.red('Error: ') + 'Function ID required. Pass --function-id or add "functionId" to rival.json.');
          process.exit(1);
        }

        const eventName = options.eventName;
        if (!eventName) {
          console.error(chalk.red('Error: ') + 'Event name required. Pass --event-name.');
          process.exit(1);
        }

        const version = options.version ?? projectConfig?.version ?? 'Draft';
        const eventData = parseEventData(options.data);

        const client = getClient(options.apiUrl);

        console.log('');
        console.log(chalk.bold('Function:  '), chalk.cyan(functionId));
        console.log(chalk.bold('Event:     '), chalk.cyan(eventName));
        console.log(chalk.bold('Version:   '), chalk.cyan(version));
        if (eventData) console.log(chalk.bold('Data:      '), chalk.dim(JSON.stringify(eventData)));
        console.log('');

        const spinner = ora('Sending test event…').start();
        const result = await client.createEvent({
          function_id: functionId,
          event_name: eventName,
          version,
          ...(options.eventId ? { event_id: options.eventId } : {}),
          ...(eventData ? { event_data: eventData } : {}),
        });
        spinner.succeed(chalk.green('Test event sent!'));

        if (result && typeof result === 'object') {
          console.log('\n' + chalk.dim(JSON.stringify(result, null, 2)));
        }
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number; data?: unknown }; config?: { url?: string } };
        if (axiosErr?.response?.status === 401) {
          console.error('\n' + chalk.red('401 Unauthorized') + ' — session expired. Run `rival login`.');
        } else if (axiosErr?.response) {
          console.error('\n' + chalk.red(`HTTP ${axiosErr.response.status} — ${axiosErr?.config?.url ?? ''}`));
          console.error(chalk.dim(JSON.stringify(axiosErr.response.data, null, 2)));
        } else {
          console.error('\n' + chalk.red('Error: ') + (err instanceof Error ? err.message : String(err)));
        }
        process.exit(1);
      }
    });

  // rival test bulk
  command
    .command('bulk')
    .description('Send multiple test events to functions in one request')
    .option('-e, --events <json>', 'Events array as JSON string')
    .option('--file <path>', 'Path to JSON file containing events array or { events: [...] }')
    .option('-u, --api-url <url>', 'Override API base URL')
    .option('--cwd <dir>', 'Working directory for rival.json lookup')
    .action(async (options: {
      events?: string;
      file?: string;
      apiUrl?: string;
      cwd?: string;
    }) => {
      try {
        type EventInput = {
          function_id: string;
          event_name: string;
          version: string;
          event_data?: Record<string, unknown>;
        };

        let events: EventInput[] = [];

        if (options.file) {
          const raw = fs.readFileSync(options.file, 'utf-8');
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            events = parsed as EventInput[];
          } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { events?: unknown }).events)) {
            events = (parsed as { events: EventInput[] }).events;
          } else {
            console.error(chalk.red('Error: ') + 'File must contain a JSON array or { "events": [...] }');
            process.exit(1);
          }
        } else if (options.events) {
          const parsed = JSON.parse(options.events) as unknown;
          if (!Array.isArray(parsed)) {
            console.error(chalk.red('Error: ') + '--events must be a JSON array');
            process.exit(1);
          }
          events = parsed as EventInput[];
        } else {
          console.error(chalk.red('Error: ') + 'Provide --events <json> or --file <path>');
          process.exit(1);
        }

        if (!events.length) {
          console.error(chalk.red('Error: ') + 'Events array is empty');
          process.exit(1);
        }

        const client = getClient(options.apiUrl);

        console.log('');
        console.log(chalk.bold('Events:'), events.length);
        events.forEach((e, i) =>
          console.log(`  ${chalk.dim(`[${i + 1}]`)} ${chalk.cyan(e.event_name)} → ${chalk.dim(e.function_id)} @ ${e.version}`)
        );
        console.log('');

        const spinner = ora(`Sending ${events.length} test event(s)…`).start();
        const result = await client.createEventsBulk(events);
        spinner.succeed(chalk.green(`${events.length} test event(s) sent!`));

        if (result && typeof result === 'object') {
          console.log('\n' + chalk.dim(JSON.stringify(result, null, 2)));
        }
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number; data?: unknown }; config?: { url?: string } };
        if (axiosErr?.response?.status === 401) {
          console.error('\n' + chalk.red('401 Unauthorized') + ' — session expired. Run `rival login`.');
        } else if (axiosErr?.response) {
          console.error('\n' + chalk.red(`HTTP ${axiosErr.response.status} — ${axiosErr?.config?.url ?? ''}`));
          console.error(chalk.dim(JSON.stringify(axiosErr.response.data, null, 2)));
        } else {
          console.error('\n' + chalk.red('Error: ') + (err instanceof Error ? err.message : String(err)));
        }
        process.exit(1);
      }
    });

  return command;
}
