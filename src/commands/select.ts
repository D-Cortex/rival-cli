import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, requireOrgId, requireToken } from '../lib/config.js';
import { loadProjectConfig } from '../lib/files.js';

type RemoteFile = { path: string; meta: { name: string; mime: string }; data: string };

function writeVersionFiles(files: RemoteFile[], workDir: string): string[] {
  const written: string[] = [];
  for (const file of files) {
    const fileName = file.path.replace(/^\//, '');
    const dest = path.join(workDir, fileName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.data ?? '', 'utf-8');
    written.push(fileName);
  }
  return written;
}

/** Returns filenames that differ between disk and the remote version. */
function detectDirtyFiles(files: RemoteFile[], workDir: string): string[] {
  const dirty: string[] = [];
  for (const file of files) {
    const fileName = file.path.replace(/^\//, '');
    const diskPath = path.join(workDir, fileName);
    if (!fs.existsSync(diskPath)) continue; // new file — not a conflict
    const diskContent = fs.readFileSync(diskPath, 'utf-8');
    if (diskContent !== (file.data ?? '')) {
      dirty.push(fileName);
    }
  }
  return dirty;
}

export function createSelectCommand(): Command {
  const command = new Command('select');

  command
    .description('Switch to a version and pull its code to disk — like git checkout')
    .option('--cwd <dir>', 'Working directory (default: current directory)')
    .option('-u, --api-url <url>', 'Override API base URL')
    .action(async (options: { cwd?: string; apiUrl?: string }) => {
      const workDir = options.cwd ?? process.cwd();
      const configPath = path.join(workDir, 'rival.json');

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

      // Fetch versions (full details so we have files too)
      const spinner = ora('Fetching versions…').start();
      let versions: Array<{ version: string; state: string; runtime: string; files: Array<{ path: string; meta: { name: string; mime: string }; data: string }> }> = [];
      try {
        versions = await client.getVersions(projectConfig.orgSlug, projectConfig.fnSlug);
        spinner.stop();
      } catch (err: unknown) {
        spinner.fail('Failed to fetch versions.');
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

      if (versions.length === 0) {
        console.log(chalk.yellow('No versions found. Defaulting to "Draft".'));
        projectConfig.version = 'Draft';
        fs.writeFileSync(configPath, JSON.stringify(projectConfig, null, 2) + '\n', 'utf-8');
        process.exit(0);
      }

      const { selectedVersion } = await prompts({
        type: 'select',
        name: 'selectedVersion',
        message: 'Select version:',
        choices: versions.map((v) => {
          const label = v.version || 'Draft';
          return { title: `${label}  ${chalk.dim(`(${v.state})`)}`, value: label };
        }),
        initial: Math.max(0, versions.findIndex((v) => (v.version || 'Draft') === projectConfig.version)),
      });
      if (!selectedVersion) process.exit(0);

      // If already on this version, skip checkout
      if (selectedVersion === projectConfig.version) {
        console.log(chalk.dim(`Already on version "${selectedVersion}". Nothing changed.`));
        process.exit(0);
      }

      // Find the full version object (files included)
      const versionObj = versions.find((v) => (v.version || 'Draft') === selectedVersion);
      const files = versionObj?.files ?? [];

      // Detect local changes that would be overwritten
      const dirty = detectDirtyFiles(files, workDir);
      if (dirty.length > 0) {
        console.log(
          '\n' + chalk.yellow('⚠  Uncommitted local changes will be overwritten:')
        );
        for (const f of dirty) {
          console.log(`   ${chalk.red('M')}  ${f}`);
        }
        console.log();
        const { confirmed } = await prompts({
          type: 'confirm',
          name: 'confirmed',
          message: `Discard local changes and switch to ${chalk.cyan(selectedVersion)}?`,
          initial: false,
        });
        if (!confirmed) {
          console.log(chalk.dim('Aborted. Your files are unchanged.'));
          process.exit(0);
        }
      }

      // Write files to disk (like git checkout)
      const writeSpinner = ora(`Checking out ${chalk.cyan(selectedVersion)}…`).start();
      const written = writeVersionFiles(files, workDir);
      writeSpinner.stop();

      // Save to rival.json
      projectConfig.version = selectedVersion;
      if (written.length > 0) projectConfig.files = written;
      fs.writeFileSync(configPath, JSON.stringify(projectConfig, null, 2) + '\n', 'utf-8');

      console.log(chalk.green('✓') + ` Switched to version ${chalk.cyan(selectedVersion)}\n`);
      for (const f of written) {
        console.log(`  ${chalk.dim('updated')}  ${f}`);
      }
      if (written.length === 0) {
        console.log(chalk.dim('  (no files in this version)'));
      }
      console.log();
    });

  return command;
}
