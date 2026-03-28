import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { RivalApiClient } from '../lib/api.js';
import { getApiUrl, requireOrgId, requireToken } from '../lib/config.js';

const TEMPLATES: Record<string, { file: string; content: string }> = {
  'python:3.13': {
    file: 'cortexone_function.py',
    content: `def handler(event, context=None):
    """
    Entry point for your CortexOne function.

    Args:
        event:   dict — input payload sent when the function is invoked
        context: optional runtime context

    Returns:
        dict — response payload
    """
    name = event.get("name", "World")

    return {
        "message": f"Hello, {name}!",
        "input": event,
    }
`,
  },
  javascript: {
    file: 'cortexone_function.js',
    content: `/**
 * Entry point for your CortexOne function.
 *
 * @param {Record<string, any>} event - input payload sent when the function is invoked
 * @returns {Record<string, any>} response payload
 */
export async function handler(event) {
  const name = event?.name ?? "World";

  return {
    message: \`Hello, \${name}!\`,
    input: event,
  };
}
`,
  },
  lua: {
    file: 'cortexone_function.lua',
    content: `--- Entry point for your CortexOne function.
--- @param event table - input payload sent when the function is invoked
--- @return table response payload

local function handler(event)
  local name = event.name or "World"

  return {
    message = "Hello, " .. name .. "!",
    input = event,
  }
end

return handler
`,
  },
};

export function createInitCommand(): Command {
  const command = new Command('init');

  command
    .description('Create a new Rival function and scaffold local files')
    .option('-u, --api-url <url>', 'Override API base URL')
    .action(async (options: { apiUrl?: string }) => {
      const cwd = process.cwd();

      if (fs.existsSync(path.join(cwd, 'rival.json'))) {
        console.error(
          chalk.red('Error: ') + 'rival.json already exists. Already initialized.'
        );
        process.exit(1);
      }

      const token = requireToken();
      const orgId = requireOrgId();
      const apiUrl = options.apiUrl ?? getApiUrl();
      const client = new RivalApiClient(apiUrl, token, orgId);

      // Fetch metadata (runtimes, categories, sectors, compute types, tool types)
      const metaSpinner = ora('Loading options…').start();
      let meta: Awaited<ReturnType<typeof client.getMetadata>>;
      try {
        meta = await client.getMetadata();
        metaSpinner.stop();
        // Uncomment to debug structure:
        // console.log(chalk.dim(JSON.stringify(meta, null, 2)));
      } catch (err: unknown) {
        metaSpinner.fail('Failed to load metadata from Rival.');
        const axiosErr = err as { response?: { status?: number; data?: unknown } };
        if (axiosErr?.response) {
          console.error(chalk.dim(JSON.stringify(axiosErr.response.data, null, 2)));
        } else {
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        }
        process.exit(1);
      }

      console.log(chalk.bold('\nRival — Create Function\n'));

      const answers = await prompts([
        {
          type: 'text',
          name: 'name',
          message: 'Function name:',
          validate: (v: string) => v.trim().length > 0 || 'Name cannot be empty',
        },
        {
          type: 'text',
          name: 'description',
          message: 'Short description:',
          validate: (v: string) => v.trim().length > 0 || 'Description cannot be empty',
        },
        ...(meta.type?.length ? [{
          type: 'select' as const,
          name: 'type',
          message: 'Tool type:',
          choices: meta.type.map((t) => ({ title: t.display_name, value: t.name })),
          initial: meta.type.findIndex((t) => t.default) ?? 0,
        }] : []),
        {
          type: 'select' as const,
          name: 'runtime',
          message: 'Runtime:',
          choices: (meta.runtimes ?? [])
            .filter((r) => TEMPLATES[r.name])
            .map((r) => ({ title: r.display_name, value: r.name })),
          initial: Math.max(0, (meta.runtimes ?? []).filter(r => TEMPLATES[r.name]).findIndex((r) => r.default)),
        },
        {
          type: 'select' as const,
          name: 'categoryId',
          message: 'Category:',
          choices: (meta.categories ?? []).map((c) => ({ title: c.name, value: c.category_id })),
        },
        {
          type: 'multiselect' as const,
          name: 'sectorIds',
          message: 'Sectors — SPACE to select, ENTER to confirm (up to 4):',
          choices: (meta.sectors ?? []).map((s) => ({ title: s.name, value: s.sector_id })),
          min: 1,
          max: 4,
        },
        {
          type: 'select' as const,
          name: 'computeType',
          message: 'Compute type:',
          choices: (meta.compute_type ?? []).map((c) => ({ title: c.display_name, value: c.name })),
          initial: Math.max(0, (meta.compute_type ?? []).findIndex((c) => c.default)),
        },
      ]);
      if (!answers.name || !answers.runtime) process.exit(0);

      // Create function on backend
      const spinner = ora(`Creating "${answers.name}" on Rival…`).start();
      let functionId: string;

      try {
        const res = await client.createFunction({
          function_name: answers.name.trim(),
          short_description: answers.description.trim(),
          runtime: answers.runtime,
          type: answers.type ?? meta.type?.[0]?.name ?? 'function',
          category_ids: answers.categoryId,
          sector_ids: answers.sectorIds.join(','),
          compute_type: answers.computeType,
        });

        if (!res?.success || !res?.data?.function?.function_id) {
          spinner.fail('Backend did not return a function ID.');
          console.error(chalk.dim(JSON.stringify(res, null, 2)));
          process.exit(1);
        }

        functionId = res.data.function.function_id;
        spinner.succeed(`Function created — ID: ${chalk.cyan(functionId)}`);

        // Write files returned by the backend to disk
        const backendFiles = res.data.function.versions?.[0]?.files ?? [];
        const writtenFiles: string[] = [];

        for (const file of backendFiles) {
          // Strip leading slash: /cortexone_function.js → cortexone_function.js
          const fileName = file.path.replace(/^\//, '');
          const filePath = path.join(cwd, fileName);
          fs.writeFileSync(filePath, file.data, 'utf-8');
          console.log(chalk.green('  created  ') + fileName);
          writtenFiles.push(fileName);
        }

        // If backend returned no files, fall back to local template
        if (writtenFiles.length === 0) {
          const template = TEMPLATES[answers.runtime] ?? TEMPLATES['python:3.13'];
          fs.writeFileSync(path.join(cwd, template.file), template.content, 'utf-8');
          console.log(chalk.green('  created  ') + template.file);
          writtenFiles.push(template.file);
        }

        // Write rival.json with real function ID and the actual file names
        const rivalConfig = {
          functionId,
          orgSlug: res.data.organization_slug,
          fnSlug: res.data.function_slug,
          version: 'Draft',
          runtime: answers.runtime,
          files: writtenFiles,
        };
        fs.writeFileSync(
          path.join(cwd, 'rival.json'),
          JSON.stringify(rivalConfig, null, 2) + '\n',
          'utf-8'
        );
        console.log(chalk.green('  created  ') + 'rival.json');

        console.log(`\n${chalk.bold('Done!')} Edit your files, then run:\n\n  ${chalk.bold('rival push')}\n`);

      } catch (err: unknown) {
        spinner.fail('Failed to create function on Rival.');
        const axiosErr = err as {
          response?: { status?: number; data?: unknown };
          config?: { url?: string };
        };
        if (axiosErr?.response) {
          console.error(chalk.red(`HTTP ${axiosErr.response.status} — ${axiosErr?.config?.url ?? ''}`));
          console.error(chalk.dim(JSON.stringify(axiosErr.response.data, null, 2)));
        } else {
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        }
        process.exit(1);
      }
    });

  return command;
}
