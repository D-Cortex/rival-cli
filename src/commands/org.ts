import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, readConfig, requireToken, switchOrg } from '../lib/config.js';

export function createOrgCommand(): Command {
  const command = new Command('org');

  command
    .description('Switch active organization')
    .option('-u, --api-url <url>', 'Override API base URL')
    .action(async (options: { apiUrl?: string }) => {
      const token = requireToken();
      const apiUrl = options.apiUrl ?? getApiUrl();
      const currentOrgId = readConfig().orgId;

      const client = new RivalApiClient(apiUrl, token);
      let me;
      try {
        me = await client.getMe();
      } catch (e) {
        console.error(chalk.red('Error: ') + (e instanceof Error ? e.message : String(e)));
        process.exit(1);
      }

      const orgs = me.data.organizations ?? [];
      if (!orgs.length) {
        console.error(chalk.red('No organizations found for this account.'));
        process.exit(1);
      }

      const { orgId } = await prompts({
        type: 'select',
        name: 'orgId',
        message: 'Switch to organization:',
        choices: orgs.map((o) => ({
          title: `${o.organization_name}  ${chalk.dim(`(${o.organization_slug})`)}`,
          value: o.organization_id,
          description: o.organization_id === currentOrgId ? 'current' : undefined,
        })),
        initial: Math.max(0, orgs.findIndex((o) => o.organization_id === currentOrgId)),
      });

      if (!orgId) process.exit(0);

      if (orgId === currentOrgId) {
        console.log(chalk.dim('Already on that organization. Nothing changed.'));
        process.exit(0);
      }

      switchOrg(orgId);
      const org = orgs.find((o) => o.organization_id === orgId)!;
      console.log(chalk.green('✓') + ` Switched to ${chalk.cyan(org.organization_name)} ${chalk.dim(`(${org.organization_slug})`)}`);
    });

  return command;
}
