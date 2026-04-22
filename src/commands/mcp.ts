import { Command } from 'commander';
import { startMcpServer } from '../mcp/server.js';

export function createMcpCommand(): Command {
  const command = new Command('mcp');

  command
    .description('Start the Rival MCP server (stdio) — connect AI agents to Rival')
    .action(async () => {
      await startMcpServer();
    });

  return command;
}
