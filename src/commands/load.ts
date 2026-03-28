import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, requireOrgId, requireToken } from '../lib/config.js';
import { loadProjectConfig } from '../lib/files.js';

export function createLoadCommand(): Command {
  const command = new Command('load');

  command
    .description('Fetch the latest code from Rival and write files to disk')
    .option('--cwd <dir>', 'Working directory (default: current directory)')
    .option('-u, --api-url <url>', 'Override API base URL')
    .action(async (options: { cwd?: string; apiUrl?: string }) => {
      const workDir = options.cwd ?? process.cwd();
      const projectConfig = loadProjectConfig(workDir);

      if (!projectConfig?.orgSlug || !projectConfig?.fnSlug) {
        console.error(
          chalk.red('Error: ') +
            'rival.json missing "orgSlug" or "fnSlug". Run `rival init` to set up the project.'
        );
        process.exit(1);
      }

      const token = requireToken();
      const orgId = requireOrgId();
      const apiUrl = options.apiUrl ?? getApiUrl();
      const client = new RivalApiClient(apiUrl, token, orgId);

      const spinner = ora('Fetching latest code…').start();

      try {
        const res = await client.getVersions(projectConfig.orgSlug, projectConfig.fnSlug);
        spinner.stop();

        if (!res || res.length === 0) {
          console.error(chalk.yellow('No versions found for this function.'));
          process.exit(1);
        }

        // Use selected version from rival.json, or first version
        const targetVersion = projectConfig.version || 'Draft';
        const version = res.find((v) => (v.version || 'Draft') === targetVersion) ?? res[0];
        const versionLabel = version.version || 'Draft';

        const files = version.files ?? [];

        if (files.length === 0) {
          console.log(chalk.yellow(`No files found in version "${versionLabel}".`));
          return;
        }

        console.log(
          chalk.bold(`\n${projectConfig.fnSlug}`) +
            chalk.dim(` — version: ${versionLabel}  runtime: ${version.runtime}\n`)
        );

        const writtenFiles: string[] = [];

        for (const file of files) {
          const fileName = file.path.replace(/^\//, '');
          const dest = path.join(workDir, fileName);

          // Ensure parent dirs exist
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, file.data ?? '', 'utf-8');
          writtenFiles.push(fileName);

          const lines = (file.data ?? '').split('\n').length;
          console.log(
            chalk.green('✓') + '  ' + chalk.bold(fileName) +
            chalk.dim(`  (${file.meta?.mime ?? 'text/plain'}, ${lines} lines)`)
          );
        }

        // Update rival.json files list
        const rivalJsonPath = path.join(workDir, 'rival.json');
        if (fs.existsSync(rivalJsonPath)) {
          const cfg = JSON.parse(fs.readFileSync(rivalJsonPath, 'utf-8'));
          cfg.files = writtenFiles;
          fs.writeFileSync(rivalJsonPath, JSON.stringify(cfg, null, 2), 'utf-8');
        }

        console.log(chalk.dim(`\n${writtenFiles.length} file(s) written to ${workDir}`));
      } catch (err: unknown) {
        spinner.fail('Failed to load code.');
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
