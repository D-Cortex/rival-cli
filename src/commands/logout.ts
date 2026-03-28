import { Command } from 'commander';
import chalk from 'chalk';
import { clearConfig } from '../lib/config.js';

export function createLogoutCommand(): Command {
  const command = new Command('logout');

  command
    .description('Clear saved credentials')
    .action(() => {
      clearConfig();
      console.log(chalk.green('✓') + ' Logged out. Credentials cleared.');
    });

  return command;
}
