import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, readConfig } from '../lib/config.js';

export function createWhoamiCommand(): Command {
  const command = new Command('whoami');

  command
    .description('Show current login state and verify token with the API')
    .option('-u, --api-url <url>', 'Override API base URL')
    .action(async (options: { apiUrl?: string }) => {
      const config = readConfig();

      if (!config.token) {
        console.log(chalk.yellow('Not logged in.') + ' Run `rival login` to authenticate.');
        return;
      }

      const apiUrl = options.apiUrl ?? getApiUrl();
      const client = new RivalApiClient(apiUrl, config.token, config.orgId);
      const spinner = ora('Verifying session…').start();

      try {
        const me = await client.getMe();
        spinner.stop();

        const user = me?.data;
        console.log(chalk.green('✓') + ' Authenticated\n');
        console.log(`  ${chalk.dim('Email:')}   ${chalk.cyan(user?.email ?? config.email ?? '—')}`);
        console.log(`  ${chalk.dim('Name:')}    ${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trimEnd());
        console.log(`  ${chalk.dim('Org ID:')}  ${chalk.cyan(config.orgId ?? '—')}`);
        console.log(`  ${chalk.dim('API:')}     ${chalk.dim(apiUrl)}`);

        const orgs = user?.organizations ?? [];
        if (orgs.length > 0) {
          console.log(`\n  ${chalk.dim('Organizations:')}`);
          orgs.forEach((org) => {
            const active = org.organization_id === config.orgId;
            console.log(
              `    ${active ? chalk.green('●') : chalk.dim('○')}  ${org.organization_name}` +
              chalk.dim(` (${org.organization_slug})`) +
              (active ? chalk.green('  ← active') : '')
            );
          });
        }
      } catch (err: unknown) {
        spinner.stop();
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr?.response?.status === 401) {
          console.log(chalk.red('✗') + ' Session expired.');
          console.log(chalk.dim('  Run `rival login` to get a fresh token.'));
        } else {
          console.log(chalk.red('✗') + ' Could not verify session.');
          console.log(chalk.dim('  ' + (err instanceof Error ? err.message : String(err))));
        }
        process.exit(1);
      }
    });

  return command;
}
