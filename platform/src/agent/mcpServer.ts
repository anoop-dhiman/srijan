import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const REG_TOKEN = process.env.SRIJAN_REG_TOKEN || '';
const PLATFORM_URL = process.env.SRIJAN_PLATFORM_URL || 'http://localhost:8080';
const WORKSPACE = process.env.SRIJAN_WORKSPACE || '';

const server = new Server(
  { name: 'srijan', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'register_app',
      description:
        'Register a running service to get a public URL. Call this after the container is running and only when the user explicitly asks for a public URL.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short alphanumeric app name, e.g. "myapp"',
          },
          port: {
            type: 'number',
            description: 'Host port the service is listening on',
          },
          path: {
            type: 'string',
            description: 'URL path prefix (defaults to /<name>)',
          },
        },
        required: ['name', 'port'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'register_app') {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      isError: true,
    };
  }

  const { name, port, path } = req.params.arguments as {
    name: string;
    port: number;
    path?: string;
  };

  const body: Record<string, unknown> = { name, port };
  if (path) body.path = path;
  if (WORKSPACE) body.workspaceName = WORKSPACE;

  try {
    const res = await fetch(`${PLATFORM_URL}/api/apps/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Registration-Token': REG_TOKEN,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      const msg = data?.error?.message || `Registration failed: ${res.status}`;
      return { content: [{ type: 'text', text: msg }], isError: true };
    }

    return {
      content: [
        {
          type: 'text',
          text: `App registered. Public URL: ${data.url}`,
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Registration error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
