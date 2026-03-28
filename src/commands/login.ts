import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { DescopeClient, RivalApiClient } from '../lib/api.js';
import { getApiUrl, writeConfig } from '../lib/config.js';

export function createLoginCommand(): Command {
  const command = new Command('login');

  command
    .description('Log in to Rival using your email (OTP via Descope)')
    .option('-e, --email <email>', 'Your Rival account email')
    .option('-u, --api-url <url>', 'Override API base URL')
    .action(async (options: { email?: string; apiUrl?: string }) => {
      const projectId = process.env.DESCOPE_PROJECT_ID ?? 'P34BHLas1imEyKtqssBSuha6Hbxu';

      const descope = new DescopeClient(projectId);
      const apiUrl = options.apiUrl ?? getApiUrl();

      try {
        // Step 1: get email
        let { email } = options;
        if (!email) {
          const answer = await inquirer.prompt<{ email: string }>([
            {
              type: 'input',
              name: 'email',
              message: 'Enter your Rival email:',
              validate: (v: string) =>
                v.includes('@') ? true : 'Enter a valid email address',
            },
          ]);
          email = answer.email;
        }

        // Step 2: send OTP via Descope
        const sendSpinner = ora(`Sending OTP to ${chalk.cyan(email)}…`).start();
        await descope.sendOtp(email);
        sendSpinner.succeed(`OTP sent to ${chalk.cyan(email)}`);

        // Step 3: prompt for OTP
        const { code } = await inquirer.prompt<{ code: string }>([
          {
            type: 'input',
            name: 'code',
            message: 'Enter the OTP code:',
            validate: (v: string) =>
              v.trim().length > 0 ? true : 'OTP cannot be empty',
          },
        ]);

        // Step 4: verify OTP via Descope — returns sessionJwt
        const verifySpinner = ora('Verifying OTP…').start();
        const result = await descope.verifyOtp(email, code.trim());
        verifySpinner.succeed('OTP verified');

        const token = result.sessionJwt as string | undefined;
        const refreshToken = result.refreshJwt as string | undefined;

        if (!token) {
          console.error(chalk.red('\nFull Descope response: ') + JSON.stringify(result, null, 2));
          console.error(chalk.red('Error: ') + 'No sessionJwt in Descope response.');
          process.exit(1);
        }

        // Step 5: fetch user's organizations from the Rival backend
        const orgSpinner = ora('Fetching your organizations…').start();
        const rivalClient = new RivalApiClient(apiUrl, token);
        const me = await rivalClient.getMe();
        orgSpinner.stop();

        const orgs = me?.data?.organizations ?? [];

        if (orgs.length === 0) {
          console.error(
            chalk.red('Error: ') +
              'No organizations found. Create one at rival.io first.'
          );
          process.exit(1);
        }

        // Step 6: prompt user to select an org
        let orgId: string;
        if (orgs.length === 1) {
          orgId = orgs[0].organization_id;
          console.log(
            chalk.green('✓') + ` Using organization: ${chalk.cyan(orgs[0].organization_name)}`
          );
        } else {
          const { selectedOrg } = await inquirer.prompt<{ selectedOrg: string }>([
            {
              type: 'list',
              name: 'selectedOrg',
              message: 'Select your organization:',
              choices: orgs.map((org) => ({
                name: `${org.organization_name} ${chalk.dim(`(${org.organization_slug})`)}`,
                value: org.organization_id,
              })),
            },
          ]);
          orgId = selectedOrg;
        }

        // Step 7: persist
        writeConfig({ token, refreshToken, orgId, email, apiUrl });

        const selectedOrg = orgs.find((o) => o.organization_id === orgId);
        console.log('\n' + chalk.green('✓') + ' Logged in as ' + chalk.cyan(email));
        console.log(chalk.dim(`  Org: ${selectedOrg?.organization_name} (${orgId})`));
        console.log(chalk.dim(`  API: ${apiUrl}`));
        console.log(chalk.dim('\nRun `rival push` to deploy function code.'));
      } catch (err: unknown) {
        const axiosErr = err as {
          response?: { status?: number; data?: unknown };
          config?: { url?: string; headers?: unknown };
        };
        if (axiosErr?.response) {
          console.error(chalk.red(`\nHTTP ${axiosErr.response.status ?? '?'} — ${axiosErr?.config?.url ?? ''}`));
          console.error(chalk.dim('Request headers: ') + JSON.stringify(axiosErr?.config?.headers, null, 2));
          console.error(chalk.dim('Response body:   ') + JSON.stringify(axiosErr.response.data, null, 2));
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error('\n' + chalk.red('Error: ') + message);
        }
        process.exit(1);
      }
    });

  return command;
}
