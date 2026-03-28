import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { loadProjectConfig, validateFilesForRuntime } from '../lib/files.js';

const TEMPLATES: Record<string, string> = {
  py: `import traceback


def handler(input: dict) -> dict:
    """
    Entry point for the Rival function.

    Args:
        input: dict — payload passed by the caller.

    Returns:
        dict with keys:
          success (bool)  — whether the call succeeded
          data    (any)   — result on success
          error   (str)   — error message on failure
    """
    try:
        # ── your logic here ─────────────────────────────────────
        result = {"message": "Hello from Rival!", "input_received": input}
        # ────────────────────────────────────────────────────────

        return {"success": True, "data": result}

    except KeyError as exc:
        return {
            "success": False,
            "error": f"Missing required field: {exc}",
        }
    except ValueError as exc:
        return {
            "success": False,
            "error": f"Invalid value: {exc}",
        }
    except Exception:
        return {
            "success": False,
            "error": traceback.format_exc(),
        }
`,

  js: `/**
 * Entry point for the Rival function.
 *
 * @param {Record<string, unknown>} input — payload passed by the caller.
 * @returns {{ success: boolean, data?: unknown, error?: string }}
 */
async function handler(input) {
  try {
    // ── your logic here ─────────────────────────────────────────
    const result = { message: 'Hello from Rival!', inputReceived: input };
    // ────────────────────────────────────────────────────────────

    return { success: true, data: result };
  } catch (/** @type {unknown} */ err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

module.exports = { handler };
`,

  lua: `-- Entry point for the Rival function.
-- @param input table  — payload passed by the caller.
-- @return table { success, data, error }

local function handler(input)
  -- wrap everything in pcall for safe error handling
  local ok, result = pcall(function()
    -- ── your logic here ───────────────────────────────────────
    return { message = "Hello from Rival!", input_received = input }
    -- ──────────────────────────────────────────────────────────
  end)

  if ok then
    return { success = true,  data  = result }
  else
    return { success = false, error = tostring(result) }
  end
end

return { handler = handler }
`,

  txt: `# requirements.txt
# Add your Python dependencies here, one per line.
# Example:
# requests==2.31.0
# numpy>=1.26
`,
};

/** Infer template key from extension, falling back to the first allowed ext for the runtime. */
function pickTemplate(filename: string, runtime: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (TEMPLATES[ext]) return ext;

  // fallback: first allowed extension for the runtime
  const fallbacks: Record<string, string> = {
    'python:3.13': 'py',
    javascript: 'js',
    lua: 'lua',
  };
  return fallbacks[runtime] ?? 'txt';
}

export function createAddCommand(): Command {
  const command = new Command('add');

  command
    .description('Add a new file to the project with a starter template')
    .argument('<filename>', 'File to create, e.g. sample.py')
    .option('--cwd <dir>', 'Working directory (default: current directory)')
    .action((filename: string, options: { cwd?: string }) => {
      const workDir = options.cwd ?? process.cwd();

      // ── 1. Load rival.json ──────────────────────────────────────────
      const projectConfig = loadProjectConfig(workDir);
      if (!projectConfig) {
        console.error(
          chalk.red('Error: ') +
            'rival.json not found. Run `rival init` to set up the project first.'
        );
        process.exit(1);
      }

      const runtime = projectConfig.runtime ?? '';

      // ── 2. Validate extension against runtime ───────────────────────
      try {
        validateFilesForRuntime([filename], runtime);
      } catch (err: unknown) {
        console.error(chalk.red('Error: ') + (err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      // ── 3. Ensure file doesn't already exist ────────────────────────
      const destPath = path.join(workDir, filename);
      if (fs.existsSync(destPath)) {
        console.error(
          chalk.red('Error: ') +
            `${filename} already exists. Delete it first or choose a different name.`
        );
        process.exit(1);
      }

      // ── 4. Write template ───────────────────────────────────────────
      const templateKey = pickTemplate(filename, runtime);
      const content = TEMPLATES[templateKey] ?? '';
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, content, 'utf-8');

      // ── 5. Update rival.json files list ────────────────────────────
      const currentFiles: string[] = projectConfig.files ?? [];
      if (!currentFiles.includes(filename)) {
        currentFiles.push(filename);
        const rivalJsonPath = path.join(workDir, 'rival.json');
        const cfg = JSON.parse(fs.readFileSync(rivalJsonPath, 'utf-8'));
        cfg.files = currentFiles;
        fs.writeFileSync(rivalJsonPath, JSON.stringify(cfg, null, 2), 'utf-8');
      }

      console.log(chalk.green('✓') + ` Created ${chalk.bold(filename)}`);
      console.log(chalk.dim(`  Added to rival.json files list`));
      console.log(chalk.dim(`  Run \`rival push\` to upload.`));
    });

  return command;
}
