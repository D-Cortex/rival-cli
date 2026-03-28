import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, requireOrgId, requireToken } from '../lib/config.js';

export function createFetchCommand(): Command {
  const command = new Command('fetch');

  command
    .description('List all functions in your organization')
    .option('-u, --api-url <url>', 'Override API base URL')
    .action(async (options: { apiUrl?: string }) => {
      const token = requireToken();
      const orgId = requireOrgId();
      const apiUrl = options.apiUrl ?? getApiUrl();
      const client = new RivalApiClient(apiUrl, token, orgId);

      const spinner = ora('Fetching functions…').start();

      try {
        const functions = await client.getFunctions();
        spinner.stop();

        if (functions.length === 0) {
          console.log(chalk.yellow('No functions found in this organization.'));
          return;
        }

        console.log(chalk.bold(`\n${functions.length} function(s) in your organization:\n`));

        for (const fn of functions) {
          const latestVersion = fn.versions?.[0];
          const runtime = latestVersion?.runtime ?? '—';
          const state = latestVersion?.state ?? '—';
          const versionName = latestVersion?.version ?? '—';

          console.log(
            chalk.cyan(fn.function_name) +
              chalk.dim(` (${fn.function_slug})`)
          );
          console.log(
            `  ${chalk.dim('ID:')}       ${fn.function_id}`
          );
          console.log(
            `  ${chalk.dim('Runtime:')}  ${runtime}  ` +
            `${chalk.dim('Version:')} ${versionName}  ` +
            `${chalk.dim('State:')} ${state}`
          );
          if (fn.short_description) {
            console.log(`  ${chalk.dim('Desc:')}     ${fn.short_description}`);
          }
          console.log(
            `  ${chalk.dim('Type:')}     ${fn.type ?? '—'}  ` +
            `${chalk.dim('Visibility:')} ${fn.visibility ?? '—'}`
          );
          console.log('');
        }
      } catch (err: unknown) {
        spinner.fail('Failed to fetch functions.');
        const axiosErr = err as { response?: { status?: number; data?: unknown } };
        if (axiosErr?.response?.status === 401) {
          console.error(chalk.dim('Run `rival login` to refresh your session.'));
        } else if (axiosErr?.response) {
          console.error(chalk.dim(JSON.stringify(axiosErr.response.data, null, 2)));
        } else {
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        }
        process.exit(1);
      }
    });

  return command;
}
