import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, requireOrgId, requireToken } from '../lib/config.js';
import { loadProjectConfig, readFilesForUpload, validateFilesForRuntime } from '../lib/files.js';

export function createPushCommand(): Command {
  const command = new Command('push');

  command
    .description('Push local code files to a Rival function')
    .argument('[files...]', 'Files to push (e.g. handler.py utils.py)')
    .option('-f, --function-id <id>', 'Function ID to push to')
    .option('-v, --version <version>', 'Version to push to (skips prompt)')
    .option('-a, --asset-id <id>', 'Digital asset ID (Storm functions only)')
    .option('-u, --api-url <url>', 'Override API base URL')
    .option('--cwd <dir>', 'Working directory (default: current directory)')
    .action(async (fileArgs: string[], options: {
      functionId?: string;
      version?: string;
      assetId?: string;
      apiUrl?: string;
      cwd?: string;
    }) => {
      const workDir = options.cwd ?? process.cwd();

      try {
        const projectConfig = loadProjectConfig(workDir);

        const functionId = options.functionId ?? projectConfig?.functionId;
        if (!functionId) {
          console.error(chalk.red('Error: ') + 'Function ID is required. Pass --function-id or add "functionId" to rival.json.');
          process.exit(1);
        }

        const digitalAssetId = options.assetId ?? projectConfig?.digitalAssetId ?? null;

        // Resolve file list: CLI args take priority over rival.json
        const fileList = fileArgs.length > 0 ? fileArgs : (projectConfig?.files ?? []);
        if (fileList.length === 0) {
          console.error(chalk.red('Error: ') + 'No files specified. Pass file paths or add "files" to rival.json.');
          process.exit(1);
        }

        // Auth + config
        const token = requireToken();
        const orgId = requireOrgId();
        const apiUrl = options.apiUrl ?? getApiUrl();
        const client = new RivalApiClient(apiUrl, token, orgId);

        // Validate file types against runtime
        const runtime = projectConfig?.runtime;
        if (runtime) {
          validateFilesForRuntime(fileList, runtime);
        }

        // Version — from flag, rival.json, or default Draft
        const version = options.version ?? projectConfig?.version ?? 'Draft';

        // Block push on non-private functions (Draft version is always allowed)
        if (version !== 'Draft' && projectConfig?.orgSlug && projectConfig?.fnSlug) {
          const visSpinner = ora('Checking function visibility…').start();
          try {
            const visibility = await client.getFunctionVisibility(
              projectConfig.orgSlug,
              projectConfig.fnSlug
            );
            visSpinner.stop();
            if (visibility !== 'private') {
              console.error(
                '\n' + chalk.red('Push blocked: ') +
                `This function is ${chalk.yellow(visibility)}.`
              );
              console.error(
                chalk.dim('Only private functions can be edited via the CLI.')
              );
              process.exit(1);
            }
          } catch {
            visSpinner.stop();
            // If we can't fetch visibility, proceed and let the backend enforce it
          }
        }

        // Read files from disk
        const readSpinner = ora(`Reading ${fileList.length} file(s)…`).start();
        const files = readFilesForUpload(fileList, workDir);
        readSpinner.succeed(`Loaded ${files.length} file(s)`);

        // Summary
        console.log('');
        console.log(chalk.bold('Function:'), chalk.cyan(functionId));
        console.log(chalk.bold('Version: '), chalk.cyan(version));
        console.log(chalk.bold('Files:'));
        files.forEach((f) => console.log(`  ${chalk.dim(f.path)}  (${f.meta.mime})`));
        console.log('');

        // Push
        const pushSpinner = ora('Pushing to Rival backend…').start();
        const result = await client.saveCode(functionId, {
          files,
          version,
          digital_asset_id: digitalAssetId,
        });
        pushSpinner.succeed(chalk.green('Code pushed successfully!'));

        if (result && typeof result === 'object') {
          console.log('\n' + chalk.dim(JSON.stringify(result, null, 2)));
        }
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number; data?: unknown }; config?: { url?: string } };
        if (axiosErr?.response?.status === 401) {
          console.error('\n' + chalk.red('401 Unauthorized') + ' — your session has expired.');
          console.error(chalk.dim('Run `rival login` to get a fresh token, then try again.'));
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
