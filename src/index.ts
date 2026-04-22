#!/usr/bin/env node
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';

// 1. Load from ~/.rival/.env (global user config — works from any directory)
dotenv.config({ path: path.join(os.homedir(), '.rival', '.env') });
// 2. Load from package dir (dev fallback, does not override above)
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Command } from 'commander';
import { createAddCommand } from './commands/add.js';
import { createMcpCommand } from './commands/mcp.js';
import { createOrgCommand } from './commands/org.js';
import { createFetchCommand } from './commands/fetch.js';
import { createFuncCommand } from './commands/func.js';
import { createInitCommand } from './commands/init.js';
import { createLoadCommand } from './commands/load.js';
import { createLoginCommand } from './commands/login.js';
import { createLogoutCommand } from './commands/logout.js';
import { createPushCommand } from './commands/push.js';
import { createSelectCommand } from './commands/select.js';
import { createDocsCommand } from './commands/docs.js';
import { createTestCommand } from './commands/test.js';
import { createWhoamiCommand } from './commands/whoami.js';

const program = new Command();

program
  .name('rival')
  .description('Rival CLI — push function code and manage your Rival workspace')
  .version('1.0.0', '-v, -V, --version', 'Output the version number');

program.addCommand(createAddCommand());
program.addCommand(createFetchCommand());
program.addCommand(createFuncCommand());
program.addCommand(createInitCommand());
program.addCommand(createLoadCommand());
program.addCommand(createLoginCommand());
program.addCommand(createLogoutCommand());
program.addCommand(createPushCommand());
program.addCommand(createSelectCommand());
program.addCommand(createDocsCommand());
program.addCommand(createTestCommand());
program.addCommand(createWhoamiCommand());
program.addCommand(createMcpCommand());
program.addCommand(createOrgCommand());

program.parse(process.argv);
