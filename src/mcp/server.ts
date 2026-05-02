/**
 * Rival MCP Server — exposes Rival functions as MCP tools for AI agents.
 *
 * The @modelcontextprotocol/sdk ships broken CJS exports wildcards (no .js
 * suffix), so we resolve sub-modules via require.resolve + absolute paths.
 */

import path from 'path';
import fs from 'fs';

// ─── SDK bootstrap (workaround for broken exports wildcard in MCP SDK) ───────

/* eslint-disable @typescript-eslint/no-var-requires */
const _sdkServerPath = require.resolve('@modelcontextprotocol/sdk/server');
const _sdkCjsRoot = path.join(path.dirname(_sdkServerPath), '..');

// Import types for TypeScript; runtime uses the require() calls below.
import type { Server as ServerType } from '@modelcontextprotocol/sdk/server/index';
import type { StdioServerTransport as StdioType } from '@modelcontextprotocol/sdk/server/stdio';
import type {
  CallToolRequest,
  ListToolsRequest,
} from '@modelcontextprotocol/sdk/types';

const { Server } = require(_sdkServerPath) as { Server: typeof ServerType };

const { StdioServerTransport } = require(
  path.join(path.dirname(_sdkServerPath), 'stdio.js')
) as { StdioServerTransport: typeof StdioType };

const { CallToolRequestSchema, ListToolsRequestSchema } = require(
  path.join(_sdkCjsRoot, 'types.js')
) as typeof import('@modelcontextprotocol/sdk/types');
/* eslint-enable @typescript-eslint/no-var-requires */

import { RivalApiClient } from '../lib/api.js';
import {
  getApiUrl,
  readConfig,
  requireOrgId,
  requireToken,
  switchOrg,
} from '../lib/config.js';
import {
  loadProjectConfig,
  readFilesForUpload,
  validateFilesForRuntime,
} from '../lib/files.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function getClient(apiUrl?: string) {
  const token = requireToken();
  const orgId = requireOrgId();
  return new RivalApiClient(apiUrl ?? getApiUrl(), token, orgId);
}

// ─── tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'rival_whoami',
    description:
      'Show the currently authenticated Rival user and their organizations. Use this to verify login state before performing other operations.',
    inputSchema: {
      type: 'object',
      properties: {
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
    },
  },
  {
    name: 'rival_list_functions',
    description:
      'List all functions in the authenticated organization. Returns function_id, function_name, function_slug, type, visibility, and available versions for each function. Use this to discover function IDs before pushing code.',
    inputSchema: {
      type: 'object',
      properties: {
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
    },
  },
  {
    name: 'rival_get_metadata',
    description:
      'Fetch available runtimes, categories, sectors, compute types, and tool types from Rival. Use this before calling rival_create_function to know valid option values.',
    inputSchema: {
      type: 'object',
      properties: {
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
    },
  },
  {
    name: 'rival_create_function',
    description:
      'Create a new Rival function and scaffold a rival.json and starter code file in the working directory. Call rival_get_metadata first to get valid runtime/category/sector/compute_type values.',
    inputSchema: {
      type: 'object',
      properties: {
        function_name: { type: 'string', description: 'Display name for the function' },
        short_description: { type: 'string', description: 'One-line description' },
        runtime: {
          type: 'string',
          description: 'Runtime identifier, e.g. "python:3.13", "javascript", "lua"',
        },
        type: {
          type: 'string',
          description: 'Tool type name from rival_get_metadata (e.g. "function")',
        },
        compute_type: {
          type: 'string',
          description: 'Compute type name from rival_get_metadata',
        },
        category_id: {
          type: 'string',
          description: 'Single category_id from rival_get_metadata',
        },
        sector_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of sector_ids from rival_get_metadata (1–4 items)',
        },
        cwd: {
          type: 'string',
          description: 'Directory to write rival.json and starter file into (default: process.cwd())',
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
      required: ['function_name', 'short_description', 'runtime', 'compute_type', 'category_id', 'sector_ids'],
    },
  },
  {
    name: 'rival_push',
    description:
      'Push local code files to a Rival function version. Reads rival.json from the working directory if present — function_id, version, runtime, and files can all be omitted when rival.json exists. Only private functions can be pushed to. Call rival_list_functions first if you need to find the function_id.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to push relative to cwd (e.g. ["handler.py", "utils.py"]). Falls back to rival.json "files" field.',
        },
        function_id: {
          type: 'string',
          description: 'Function ID to push to. Falls back to rival.json "functionId".',
        },
        version: {
          type: 'string',
          description: 'Version string (e.g. "Draft", "v1"). Falls back to rival.json "version", then "Draft".',
        },
        digital_asset_id: {
          type: 'string',
          description: 'Digital asset ID (Storm functions only, optional)',
        },
        cwd: {
          type: 'string',
          description: 'Working directory containing the files and rival.json (default: process.cwd())',
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
    },
  },
  {
    name: 'rival_load',
    description:
      'Fetch the latest code for a function from Rival and write the files to disk. Reads rival.json for org_slug and fn_slug if not provided.',
    inputSchema: {
      type: 'object',
      properties: {
        org_slug: {
          type: 'string',
          description: 'Organization slug. Falls back to rival.json "orgSlug".',
        },
        fn_slug: {
          type: 'string',
          description: 'Function slug. Falls back to rival.json "fnSlug".',
        },
        cwd: {
          type: 'string',
          description: 'Directory to write files to (default: process.cwd())',
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
    },
  },
  {
    name: 'rival_get_versions',
    description:
      'List all versions of a function including their state, runtime, and files. Reads rival.json for org_slug and fn_slug if not provided.',
    inputSchema: {
      type: 'object',
      properties: {
        org_slug: {
          type: 'string',
          description: 'Organization slug. Falls back to rival.json "orgSlug".',
        },
        fn_slug: {
          type: 'string',
          description: 'Function slug. Falls back to rival.json "fnSlug".',
        },
        cwd: {
          type: 'string',
          description: 'Working directory containing rival.json (default: process.cwd())',
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
    },
  },
  {
    name: 'rival_switch_org',
    description:
      'Switch the active organization saved in ~/.rival/config.json. Pass org_id to switch directly, or omit it to list all available organizations and their IDs so you can pick one.',
    inputSchema: {
      type: 'object',
      properties: {
        org_id: {
          type: 'string',
          description: 'Organization ID to switch to. Omit to list available organizations.',
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
    },
  },
  {
    name: 'rival_update_function',
    description:
      'Update a function\'s metadata and documentation. long_description must be a JSON string with keys: what_it_does, how_it_works, strengths (array), limitations (array), long_description (markdown string).',
    inputSchema: {
      type: 'object',
      properties: {
        org_slug: { type: 'string', description: 'Organization slug. Falls back to rival.json "orgSlug".' },
        fn_slug: { type: 'string', description: 'Function slug. Falls back to rival.json "fnSlug".' },
        function_id: { type: 'string', description: 'Function ID. Falls back to rival.json "functionId".' },
        function_name: { type: 'string', description: 'Display name for the function' },
        short_description: { type: 'string', description: 'One-line description' },
        category_ids: { type: 'array', items: { type: 'string' }, description: 'Category IDs' },
        sector_ids: { type: 'array', items: { type: 'string' }, description: 'Sector IDs' },
        tag_ids: { type: 'array', items: { type: 'string' }, description: 'Tag IDs' },
        long_description: {
          type: 'object',
          description: 'Documentation object — will be JSON-stringified before sending',
          properties: {
            what_it_does: { type: 'string' },
            how_it_works: { type: 'string' },
            strengths: { type: 'array', items: { type: 'string' } },
            limitations: { type: 'array', items: { type: 'string' } },
            long_description: { type: 'string', description: 'Markdown documentation' },
          },
        },
        cwd: { type: 'string', description: 'Working directory for rival.json lookup (default: process.cwd())' },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
    },
  },
  {
    name: 'rival_create_test_event',
    description:
      'Send a single test event to a Rival function. Use this to trigger function execution with a specific event payload for testing.',
    inputSchema: {
      type: 'object',
      properties: {
        function_id: {
          type: 'string',
          description: 'Function ID to send the event to. Falls back to rival.json "functionId".',
        },
        event_name: {
          type: 'string',
          description: 'Event name (e.g. "user.signup", "order.placed")',
        },
        version: {
          type: 'string',
          description: 'Function version to target (e.g. "Draft", "v1"). Falls back to rival.json "version", then "Draft".',
        },
        event_id: {
          type: 'string',
          description: 'Optional unique event ID',
        },
        event_data: {
          type: 'object',
          description: 'Arbitrary event payload object',
          additionalProperties: true,
        },
        cwd: {
          type: 'string',
          description: 'Working directory for rival.json lookup (default: process.cwd())',
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
      required: ['event_name'],
    },
  },
  {
    name: 'rival_create_test_events_bulk',
    description:
      'Send multiple test events to Rival functions in a single request. Each event can target a different function or version.',
    inputSchema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          description: 'Array of events to send',
          items: {
            type: 'object',
            properties: {
              function_id: { type: 'string', description: 'Function ID' },
              event_name: { type: 'string', description: 'Event name' },
              version: { type: 'string', description: 'Function version (e.g. "v1", "Draft")' },
              event_data: {
                type: 'object',
                description: 'Arbitrary event payload',
                additionalProperties: true,
              },
            },
            required: ['function_id', 'event_name', 'version'],
          },
        },
        cwd: {
          type: 'string',
          description: 'Working directory for rival.json lookup (default: process.cwd())',
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
      required: ['events'],
    },
  },
  {
    name: 'rival_get_test_events',
    description:
      'List all test events / test cases for a function. Returns event IDs, names, and payloads. Falls back to rival.json for org_slug and fn_slug.',
    inputSchema: {
      type: 'object',
      properties: {
        org_slug: {
          type: 'string',
          description: 'Organization slug. Falls back to rival.json "orgSlug".',
        },
        fn_slug: {
          type: 'string',
          description: 'Function slug. Falls back to rival.json "fnSlug".',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for rival.json lookup (default: process.cwd())',
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
    },
  },
  {
    name: 'rival_update_test_event',
    description:
      'Update an existing test event / test case by event ID. Can update the event name, version, and/or payload.',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'ID of the event to update.',
        },
        event_name: {
          type: 'string',
          description: 'New event name.',
        },
        version: {
          type: 'string',
          description: 'New version string (e.g. "", "Draft", "v1").',
        },
        event_data: {
          type: 'object',
          description: 'New event payload object.',
          additionalProperties: true,
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'rival_update_test_events_bulk',
    description:
      'Update multiple test events in a single call. Useful for patching version, name, or data across many events at once.',
    inputSchema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          description: 'Array of events to update.',
          items: {
            type: 'object',
            properties: {
              event_id: { type: 'string', description: 'ID of the event to update.' },
              event_name: { type: 'string', description: 'New event name.' },
              version: { type: 'string', description: 'New version string.' },
              event_data: { type: 'object', additionalProperties: true, description: 'New payload.' },
            },
            required: ['event_id'],
          },
        },
        api_url: { type: 'string', description: 'Override API base URL (optional)' },
      },
      required: ['events'],
    },
  },
];

// ─── tool handlers ───────────────────────────────────────────────────────────

type AnyArgs = Record<string, unknown>;

async function handleWhoami(args: AnyArgs) {
  try {
    const client = getClient(args.api_url as string | undefined);
    const me = await client.getMe();
    return ok(me.data);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleListFunctions(args: AnyArgs) {
  try {
    const client = getClient(args.api_url as string | undefined);
    const fns = await client.getFunctions();
    return ok(fns);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleGetMetadata(args: AnyArgs) {
  try {
    const client = getClient(args.api_url as string | undefined);
    const meta = await client.getMetadata();
    return ok(meta);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleCreateFunction(args: AnyArgs) {
  try {
    const workDir = (args.cwd as string | undefined) ?? process.cwd();
    const rivalJsonPath = path.join(workDir, 'rival.json');

    if (fs.existsSync(rivalJsonPath)) {
      return fail('rival.json already exists in this directory. Function already initialized.');
    }

    const client = getClient(args.api_url as string | undefined);
    const meta = await client.getMetadata();

    const runtime = (args.runtime as string) ?? meta.runtimes?.find((r) => r.default)?.name ?? 'python:3.13';
    const type = (args.type as string) ?? meta.type?.find((t) => t.default)?.name ?? meta.type?.[0]?.name ?? 'function';
    const computeType = (args.compute_type as string) ?? meta.compute_type?.find((c) => c.default)?.name ?? meta.compute_type?.[0]?.name ?? 'standard';
    const categoryId = args.category_id as string;
    const sectorIds = (args.sector_ids as string[]) ?? [];

    if (!categoryId) return fail('category_id is required');
    if (!sectorIds.length) return fail('sector_ids must have at least one item');

    const res = await client.createFunction({
      function_name: args.function_name as string,
      short_description: args.short_description as string,
      runtime,
      type,
      compute_type: computeType,
      category_ids: categoryId,
      sector_ids: sectorIds.join(','),
    });

    if (!res?.success || !res?.data?.function?.function_id) {
      return fail(`Backend error: ${JSON.stringify(res)}`);
    }

    const functionId = res.data.function.function_id;
    const writtenFiles: string[] = [];

    const backendFiles = res.data.function.versions?.[0]?.files ?? [];
    for (const file of backendFiles) {
      const fileName = file.path.replace(/^\//, '');
      fs.writeFileSync(path.join(workDir, fileName), file.data, 'utf-8');
      writtenFiles.push(fileName);
    }

    if (writtenFiles.length === 0) {
      const TEMPLATES: Record<string, { file: string; content: string }> = {
        'python:3.13': { file: 'cortexone_function.py', content: 'def handler(event, context=None):\n    return {"result": event}\n' },
        javascript: { file: 'cortexone_function.js', content: 'export async function handler(event) {\n  return { result: event };\n}\n' },
        lua: { file: 'cortexone_function.lua', content: 'local function handler(event)\n  return { result = event }\nend\nreturn handler\n' },
      };
      const tpl = TEMPLATES[runtime] ?? TEMPLATES['python:3.13'];
      fs.writeFileSync(path.join(workDir, tpl.file), tpl.content, 'utf-8');
      writtenFiles.push(tpl.file);
    }

    const rivalConfig = {
      functionId,
      orgSlug: res.data.organization_slug,
      fnSlug: res.data.function_slug,
      version: 'Draft',
      runtime,
      files: writtenFiles,
    };
    fs.writeFileSync(rivalJsonPath, JSON.stringify(rivalConfig, null, 2) + '\n', 'utf-8');

    return ok({
      function_id: functionId,
      org_slug: res.data.organization_slug,
      fn_slug: res.data.function_slug,
      runtime,
      files_created: writtenFiles,
      rival_json: rivalConfig,
      message: 'Function created. Edit your files, then call rival_push.',
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handlePush(args: AnyArgs) {
  try {
    const workDir = (args.cwd as string | undefined) ?? process.cwd();
    const projectConfig = loadProjectConfig(workDir);

    const functionId = (args.function_id as string | undefined) ?? projectConfig?.functionId;
    if (!functionId) {
      return fail('function_id is required. Pass it directly or add "functionId" to rival.json.');
    }

    const fileList = (args.files as string[] | undefined)?.length
      ? (args.files as string[])
      : (projectConfig?.files ?? []);
    if (!fileList.length) {
      return fail('No files specified. Pass "files" array or add "files" to rival.json.');
    }

    const client = getClient(args.api_url as string | undefined);

    const runtime = projectConfig?.runtime;
    if (runtime) validateFilesForRuntime(fileList, runtime);

    const version = (args.version as string | undefined) ?? projectConfig?.version ?? 'Draft';

    if (version !== 'Draft' && projectConfig?.orgSlug && projectConfig?.fnSlug) {
      try {
        const visibility = await client.getFunctionVisibility(
          projectConfig.orgSlug,
          projectConfig.fnSlug
        );
        if (visibility !== 'private') {
          return fail(`Push blocked: function is "${visibility}". Only private functions can be pushed to via CLI.`);
        }
      } catch {
        // Can't fetch visibility — let backend enforce
      }
    }
    const files = readFilesForUpload(fileList, workDir);
    const digitalAssetId = (args.digital_asset_id as string | null | undefined) ?? projectConfig?.digitalAssetId ?? null;

    const result = await client.saveCode(functionId, { files, version, digital_asset_id: digitalAssetId });

    return ok({
      success: true,
      function_id: functionId,
      version,
      files_pushed: files.map((f) => f.path),
      response: result,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleLoad(args: AnyArgs) {
  try {
    const workDir = (args.cwd as string | undefined) ?? process.cwd();
    const projectConfig = loadProjectConfig(workDir);

    const orgSlug = (args.org_slug as string | undefined) ?? projectConfig?.orgSlug;
    const fnSlug = (args.fn_slug as string | undefined) ?? projectConfig?.fnSlug;

    if (!orgSlug || !fnSlug) {
      return fail('org_slug and fn_slug are required. Pass them directly or add "orgSlug"/"fnSlug" to rival.json.');
    }

    const client = getClient(args.api_url as string | undefined);
    const versions = await client.getVersions(orgSlug, fnSlug);
    if (!versions.length) return fail('No versions found for this function.');

    const latest = versions[0];
    const written: string[] = [];
    for (const file of latest.files ?? []) {
      const fileName = file.path.replace(/^\//, '');
      const filePath = path.join(workDir, fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.data, 'utf-8');
      written.push(fileName);
    }

    return ok({ version: latest.version, runtime: latest.runtime, files_written: written });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleGetVersions(args: AnyArgs) {
  try {
    const workDir = (args.cwd as string | undefined) ?? process.cwd();
    const projectConfig = loadProjectConfig(workDir);

    const orgSlug = (args.org_slug as string | undefined) ?? projectConfig?.orgSlug;
    const fnSlug = (args.fn_slug as string | undefined) ?? projectConfig?.fnSlug;

    if (!orgSlug || !fnSlug) {
      return fail('org_slug and fn_slug are required. Pass them directly or add "orgSlug"/"fnSlug" to rival.json.');
    }

    const client = getClient(args.api_url as string | undefined);
    const versions = await client.getVersions(orgSlug, fnSlug);
    return ok(versions.map((v) => ({ version: v.version, state: v.state, runtime: v.runtime })));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleSwitchOrg(args: AnyArgs) {
  try {
    const client = getClient(args.api_url as string | undefined);
    const me = await client.getMe();
    const orgs = me.data.organizations ?? [];

    if (!args.org_id) {
      const current = readConfig().orgId;
      return ok({
        current_org_id: current,
        organizations: orgs.map((o) => ({
          organization_id: o.organization_id,
          organization_name: o.organization_name,
          organization_slug: o.organization_slug,
          role: o.role,
          active: o.organization_id === current,
        })),
        hint: 'Call rival_switch_org again with org_id to switch.',
      });
    }

    const target = orgs.find((o) => o.organization_id === args.org_id);
    if (!target) {
      return fail(`Organization "${args.org_id}" not found. Call rival_switch_org without org_id to list available organizations.`);
    }

    switchOrg(target.organization_id);
    return ok({
      switched_to: {
        organization_id: target.organization_id,
        organization_name: target.organization_name,
        organization_slug: target.organization_slug,
      },
      message: `Active organization set to "${target.organization_name}".`,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleUpdateFunction(args: AnyArgs) {
  try {
    const workDir = (args.cwd as string | undefined) ?? process.cwd();
    const projectConfig = loadProjectConfig(workDir);

    const orgSlug = (args.org_slug as string | undefined) ?? projectConfig?.orgSlug;
    const fnSlug = (args.fn_slug as string | undefined) ?? projectConfig?.fnSlug;
    const functionId = (args.function_id as string | undefined) ?? projectConfig?.functionId;

    if (!orgSlug || !fnSlug) return fail('org_slug and fn_slug are required.');
    if (!functionId) return fail('function_id is required.');

    const payload: {
      function_id: string;
      function_name?: string;
      short_description?: string;
      category_ids?: string[];
      sector_ids?: string[];
      tag_ids?: string[];
      long_description?: string;
    } = { function_id: functionId };

    if (args.function_name) payload.function_name = args.function_name as string;
    if (args.short_description) payload.short_description = args.short_description as string;
    if (args.category_ids) payload.category_ids = args.category_ids as string[];
    if (args.sector_ids) payload.sector_ids = args.sector_ids as string[];
    if (args.tag_ids) payload.tag_ids = args.tag_ids as string[];
    if (args.long_description) {
      payload.long_description = typeof args.long_description === 'string'
        ? args.long_description
        : JSON.stringify(args.long_description);
    }

    const client = getClient(args.api_url as string | undefined);
    const result = await client.updateFunctionDetails(orgSlug, fnSlug, payload);
    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleCreateTestEvent(args: AnyArgs) {
  try {
    const workDir = (args.cwd as string | undefined) ?? process.cwd();
    const projectConfig = loadProjectConfig(workDir);

    const functionId = (args.function_id as string | undefined) ?? projectConfig?.functionId;
    if (!functionId) {
      return fail('function_id is required. Pass it directly or add "functionId" to rival.json.');
    }

    const eventName = args.event_name as string | undefined;
    if (!eventName) return fail('event_name is required.');

    const version = (args.version as string | undefined) ?? projectConfig?.version ?? 'Draft';
    const client = getClient(args.api_url as string | undefined);

    const result = await client.createEvent({
      function_id: functionId,
      event_name: eventName,
      version,
      ...(args.event_id ? { event_id: args.event_id as string } : {}),
      ...(args.event_data ? { event_data: args.event_data as Record<string, unknown> } : {}),
    });

    return ok({ success: true, function_id: functionId, event_name: eventName, version, response: result });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleCreateTestEventsBulk(args: AnyArgs) {
  try {
    const events = args.events as Array<{
      function_id: string;
      event_name: string;
      version: string;
      event_data?: Record<string, unknown>;
    }>;

    if (!Array.isArray(events) || !events.length) {
      return fail('events must be a non-empty array.');
    }

    const client = getClient(args.api_url as string | undefined);
    const result = await client.createEventsBulk(events);

    return ok({ success: true, events_sent: events.length, response: result });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleGetTestEvents(args: AnyArgs) {
  try {
    const workDir = (args.cwd as string | undefined) ?? process.cwd();
    const projectConfig = loadProjectConfig(workDir);

    const orgSlug = (args.org_slug as string | undefined) ?? projectConfig?.orgSlug;
    const fnSlug = (args.fn_slug as string | undefined) ?? projectConfig?.fnSlug;

    if (!orgSlug || !fnSlug) {
      return fail('org_slug and fn_slug are required. Pass them directly or add "orgSlug"/"fnSlug" to rival.json.');
    }

    const client = getClient(args.api_url as string | undefined);
    const result = await client.getEvents(orgSlug, fnSlug);
    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleUpdateTestEvent(args: AnyArgs) {
  try {
    const eventId = args.event_id as string | undefined;
    if (!eventId) return fail('event_id is required.');

    const payload: { event_name?: string; event_data?: Record<string, unknown>; version?: string } = {};
    if (args.event_name) payload.event_name = args.event_name as string;
    if (args.event_data) payload.event_data = args.event_data as Record<string, unknown>;
    if (args.version !== undefined) payload.version = args.version as string;

    const client = getClient(args.api_url as string | undefined);
    const result = await client.updateEvent(eventId, payload);
    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleUpdateTestEventsBulk(args: AnyArgs) {
  try {
    const events = args.events as Array<{
      event_id: string;
      event_name?: string;
      version?: string;
      event_data?: Record<string, unknown>;
    }>;

    if (!Array.isArray(events) || !events.length) {
      return fail('events must be a non-empty array.');
    }

    const client = getClient(args.api_url as string | undefined);
    const results = await Promise.all(
      events.map((e) => {
        const payload: { event_name?: string; version?: string; event_data?: Record<string, unknown> } = {};
        if (e.event_name) payload.event_name = e.event_name;
        if (e.version !== undefined) payload.version = e.version;
        if (e.event_data) payload.event_data = e.event_data;
        return client.updateEvent(e.event_id, payload)
          .then((res) => ({ event_id: e.event_id, success: true, response: res }))
          .catch((err: Error) => ({ event_id: e.event_id, success: false, error: err.message }));
      })
    );

    const failed = results.filter((r) => !r.success);
    return ok({ updated: results.length - failed.length, failed: failed.length, results });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// ─── server bootstrap ────────────────────────────────────────────────────────

export async function startMcpServer() {
  const server = new Server(
    { name: 'rival-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async (_req: ListToolsRequest) => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case 'rival_whoami':          return handleWhoami(args as AnyArgs);
      case 'rival_list_functions':  return handleListFunctions(args as AnyArgs);
      case 'rival_get_metadata':    return handleGetMetadata(args as AnyArgs);
      case 'rival_create_function': return handleCreateFunction(args as AnyArgs);
      case 'rival_push':            return handlePush(args as AnyArgs);
      case 'rival_load':            return handleLoad(args as AnyArgs);
      case 'rival_get_versions':    return handleGetVersions(args as AnyArgs);
      case 'rival_switch_org':               return handleSwitchOrg(args as AnyArgs);
      case 'rival_update_function':           return handleUpdateFunction(args as AnyArgs);
      case 'rival_create_test_event':        return handleCreateTestEvent(args as AnyArgs);
      case 'rival_create_test_events_bulk':  return handleCreateTestEventsBulk(args as AnyArgs);
      case 'rival_get_test_events':           return handleGetTestEvents(args as AnyArgs);
      case 'rival_update_test_event':         return handleUpdateTestEvent(args as AnyArgs);
      case 'rival_update_test_events_bulk':   return handleUpdateTestEventsBulk(args as AnyArgs);
      default:
        return fail(`Unknown tool: ${name}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
