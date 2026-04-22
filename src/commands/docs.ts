import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, requireOrgId, requireToken } from '../lib/config.js';
import { loadProjectConfig } from '../lib/files.js';

interface LongDescriptionDoc {
  what_it_does: string;
  how_it_works: string;
  strengths: string[];
  limitations: string[];
  long_description: string;
}

export function createDocsCommand(): Command {
  const command = new Command('docs');

  command
    .description('Update function documentation and metadata')
    .option('--org-slug <slug>', 'Organization slug (falls back to rival.json)')
    .option('--fn-slug <slug>', 'Function slug (falls back to rival.json)')
    .option('--function-id <id>', 'Function ID (falls back to rival.json)')
    .option('--name <name>', 'Function display name')
    .option('--short-description <desc>', 'One-line description')
    .option('--category-ids <ids>', 'Comma-separated category IDs')
    .option('--sector-ids <ids>', 'Comma-separated sector IDs')
    .option('--tag-ids <ids>', 'Comma-separated tag IDs')
    .option('--docs-file <path>', 'Path to JSON file with long_description fields (what_it_does, how_it_works, strengths, limitations, long_description)')
    .option('--long-description <json>', 'Long description as JSON string')
    .option('-u, --api-url <url>', 'Override API base URL')
    .option('--cwd <dir>', 'Working directory for rival.json lookup')
    .action(async (options: {
      orgSlug?: string;
      fnSlug?: string;
      functionId?: string;
      name?: string;
      shortDescription?: string;
      categoryIds?: string;
      sectorIds?: string;
      tagIds?: string;
      docsFile?: string;
      longDescription?: string;
      apiUrl?: string;
      cwd?: string;
    }) => {
      const workDir = options.cwd ?? process.cwd();
      try {
        const projectConfig = loadProjectConfig(workDir);

        const orgSlug = options.orgSlug ?? projectConfig?.orgSlug;
        const fnSlug = options.fnSlug ?? projectConfig?.fnSlug;
        const functionId = options.functionId ?? projectConfig?.functionId;

        if (!orgSlug || !fnSlug) {
          console.error(chalk.red('Error: ') + 'org-slug and fn-slug required. Pass them or add to rival.json.');
          process.exit(1);
        }
        if (!functionId) {
          console.error(chalk.red('Error: ') + 'function-id required. Pass --function-id or add "functionId" to rival.json.');
          process.exit(1);
        }

        // Resolve long_description
        let longDescription: string | undefined;
        if (options.docsFile) {
          const raw = fs.readFileSync(options.docsFile, 'utf-8');
          const parsed = JSON.parse(raw) as LongDescriptionDoc;
          longDescription = JSON.stringify(parsed);
        } else if (options.longDescription) {
          // Accept either raw JSON string or already-stringified
          try {
            const parsed = JSON.parse(options.longDescription) as unknown;
            longDescription = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          } catch {
            console.error(chalk.red('Error: ') + '--long-description must be valid JSON');
            process.exit(1);
          }
        }

        const token = requireToken();
        const orgId = requireOrgId();
        const client = new RivalApiClient(options.apiUrl ?? getApiUrl(), token, orgId);

        const payload: Parameters<typeof client.updateFunctionDetails>[2] = { function_id: functionId };
        if (options.name) payload.function_name = options.name;
        if (options.shortDescription) payload.short_description = options.shortDescription;
        if (options.categoryIds) payload.category_ids = options.categoryIds.split(',').map((s) => s.trim());
        if (options.sectorIds) payload.sector_ids = options.sectorIds.split(',').map((s) => s.trim());
        if (options.tagIds) payload.tag_ids = options.tagIds.split(',').map((s) => s.trim());
        if (longDescription) payload.long_description = longDescription;

        console.log('');
        console.log(chalk.bold('Function:'), chalk.cyan(`${orgSlug}/${fnSlug}`));
        if (options.name) console.log(chalk.bold('Name:    '), chalk.cyan(options.name));
        if (options.shortDescription) console.log(chalk.bold('Desc:    '), chalk.dim(options.shortDescription));
        if (longDescription) console.log(chalk.bold('Docs:    '), chalk.dim('(long_description provided)'));
        console.log('');

        const spinner = ora('Updating function details…').start();
        const result = await client.updateFunctionDetails(orgSlug, fnSlug, payload);
        spinner.succeed(chalk.green('Function details updated!'));

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
