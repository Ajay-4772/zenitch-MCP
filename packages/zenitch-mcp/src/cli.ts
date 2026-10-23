#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ZenitchServer } from './server.js';

export async function runServer(): Promise<void> {
  const server = new ZenitchServer({
    requireApprovalForChanges: true,
    enableZenitchTools: process.env.ZENITCH_ENABLED === 'true' || process.env.ZENITCH_ENABLED === '1',
    logLevel: (process.env.ZENITCH_LOG_LEVEL as any) || 'INFO'
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  server.log('INFO', 'Zenitch MCP server running on stdio');
}

// Only auto-run if executed as the main CLI entry point
runServer().catch((error) => {
  console.error('Fatal error initializing Zenitch MCP server:', error);
  process.exit(1);
});
