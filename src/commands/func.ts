import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, requireOrgId, requireToken } from '../lib/config.js';

/**
 * Parses a rival:// URI into { orgSlug, fnSlug }.
 *
 * Accepted formats:
 *   rival://orgSlug:fnSlug
 *   rival://orgSlug/fnSlug
 *   orgSlug:fnSlug          (shorthand, no scheme)
 */
function parseRivalUri(uri: string): { orgSlug: string; fnSlug: string } {
  const stripped = uri.replace(/^rival:\/\//, '');

  // separator can be : or /
  const sepIndex = stripped.search(/[:/]/);
  if (sepIndex === -1) {
    throw new Error(
      `Invalid rival URI "${uri}". Expected format: rival://orgSlug:fnSlug`
    );
  }

  const orgSlug = stripped.slice(0, sepIndex).trim();
  const fnSlug  = stripped.slice(sepIndex + 1).trim();

  if (!orgSlug || !fnSlug) {
    throw new Error(
      `Invalid rival URI "${uri}". Both orgSlug and fnSlug are required.`
    );
  }

  return { orgSlug, fnSlug };
}

export function createFuncCommand(): Command {
  const command = new Command('func');

  command
    .description('Fetch and load a function by its rival:// URI')
    .argument('<uri>', 'Function URI, e.g. rival://acme:my-forecast or acme:my-forecast')
    .option('-o, --output <dir>', 'Directory to write files into (default: ./<fnSlug>)')
    .option('--version <ver>', 'Version to load (default: first available)')
    .option('-u, --api-url <url>', 'Override API base URL')
    .action(async (uri: string, options: { output?: string; version?: string; apiUrl?: string }) => {

      // ── 1. Parse URI ────────────────────────────────────────────────
      let orgSlug: string;
      let fnSlug: string;
      try {
        ({ orgSlug, fnSlug } = parseRivalUri(uri));
      } catch (err: unknown) {
        console.error(chalk.red('Error: ') + (err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      const token  = requireToken();
      const orgId  = requireOrgId();
      const apiUrl = options.apiUrl ?? getApiUrl();
      const client = new RivalApiClient(apiUrl, token, orgId);

      console.log(
        chalk.dim('rival://') +
        chalk.cyan(orgSlug) +
        chalk.dim(':') +
        chalk.bold(fnSlug) +
        '\n'
      );

      // ── 2. Fetch versions ────────────────────────────────────────────
      const spinner = ora('Fetching function…').start();
      let versions: Array<{
        version: string;
        state: string;
        runtime: string;
        files: Array<{ path: string; meta: { name: string; mime: string }; data: string }>;
      }>;

      try {
        versions = await client.getVersions(orgSlug, fnSlug);
        spinner.stop();
      } catch (err: unknown) {
        spinner.fail('Could not fetch function.');
        const axiosErr = err as { response?: { status?: number; data?: unknown } };
        if (axiosErr?.response?.status === 404) {
          console.error(chalk.red(`Function not found: ${orgSlug}:${fnSlug}`));
          console.error(chalk.dim('Check the org slug and function slug are correct.'));
        } else if (axiosErr?.response?.status === 401) {
          console.error(chalk.dim('Session expired. Run `rival login`.'));
        } else if (axiosErr?.response) {
          console.error(chalk.dim(JSON.stringify(axiosErr.response.data, null, 2)));
        } else {
          console.error(chalk.red(err instanceof Error ? (err as Error).message : String(err)));
        }
        process.exit(1);
      }

      if (!versions || versions.length === 0) {
        console.error(chalk.yellow('No versions found for this function.'));
        process.exit(1);
      }

      // ── 3. Resolve target version ────────────────────────────────────
      const targetLabel = options.version ?? null;
      const versionObj = targetLabel
        ? (versions.find((v) => (v.version || 'Draft') === targetLabel) ?? null)
        : versions[0];

      if (!versionObj) {
        console.error(chalk.red(`Version "${targetLabel}" not found.`));
        console.error(
          chalk.dim('Available: ') +
          versions.map((v) => v.version || 'Draft').join(', ')
        );
        process.exit(1);
      }

      const versionLabel = versionObj.version || 'Draft';
      const files = versionObj.files ?? [];

      if (files.length === 0) {
        console.log(chalk.yellow(`No files in version "${versionLabel}".`));
        process.exit(0);
      }

      // ── 4. Resolve output directory ──────────────────────────────────
      const outDir = path.resolve(options.output ?? path.join(process.cwd(), fnSlug));

      // If directory exists and has files, list what will be overwritten
      if (fs.existsSync(outDir)) {
        const conflicts = files
          .map((f) => f.path.replace(/^\//, ''))
          .filter((name) => fs.existsSync(path.join(outDir, name)));

        if (conflicts.length > 0) {
          console.log(chalk.yellow('⚠  The following files already exist and will be overwritten:'));
          for (const f of conflicts) console.log(`   ${chalk.red('M')}  ${f}`);
          console.log();

          const { default: prompts } = await import('prompts');
          const { confirmed } = await prompts({
            type: 'confirm',
            name: 'confirmed',
            message: `Overwrite existing files in ${path.relative(process.cwd(), outDir) || '.'}?`,
            initial: false,
          });
          if (!confirmed) {
            console.log(chalk.dim('Aborted.'));
            process.exit(0);
          }
        }
      }

      // ── 5. Write files ───────────────────────────────────────────────
      fs.mkdirSync(outDir, { recursive: true });
      const writtenFiles: string[] = [];

      for (const file of files) {
        const fileName = file.path.replace(/^\//, '');
        const dest = path.join(outDir, fileName);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, file.data ?? '', 'utf-8');
        writtenFiles.push(fileName);

        const lines = (file.data ?? '').split('\n').length;
        console.log(
          chalk.green('✓') + '  ' + chalk.bold(fileName) +
          chalk.dim(`  (${file.meta?.mime ?? 'text/plain'}, ${lines} lines)`)
        );
      }

      // ── 6. Write rival.json ──────────────────────────────────────────
      // Fetch function ID from summary list so rival.json is push-ready
      let functionId: string | undefined;
      try {
        const fns = await client.getFunctions();
        const match = fns.find((f) => f.function_slug === fnSlug);
        functionId = match?.function_id;
      } catch {
        // non-fatal — rival.json will just be missing functionId
      }

      const rivalJson = {
        ...(functionId ? { functionId } : {}),
        orgSlug,
        fnSlug,
        version: versionLabel,
        runtime: versionObj.runtime,
        files: writtenFiles,
      };

      fs.writeFileSync(
        path.join(outDir, 'rival.json'),
        JSON.stringify(rivalJson, null, 2) + '\n',
        'utf-8'
      );

      console.log(
        `\n${chalk.green('✓')} Loaded ${chalk.bold(fnSlug)} @ ${chalk.cyan(versionLabel)} ` +
        chalk.dim(`→ ${path.relative(process.cwd(), outDir) || '.'}`)
      );
      console.log(chalk.dim(`  ${writtenFiles.length} file(s) written  ·  rival.json created`));
      console.log(chalk.dim(`\n  cd ${path.relative(process.cwd(), outDir) || '.'} && rival push`));
    });

  return command;
}
