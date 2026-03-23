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
            description: 'Container port the service is listening on (NOT the host-mapped port)',
          },
          path: {
            type: 'string',
            description: 'URL path prefix (defaults to /<name>)',
          },
          containerName: {
            type: 'string',
            description: 'Docker container name running the service (e.g. "todo-app-web-1"). Required when the app runs as a Docker container so Caddy can route to it by name.',
          },
        },
        required: ['name', 'port', 'containerName'],
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

  const { name, port, path, containerName } = req.params.arguments as {
    name: string;
    port: number;
    path?: string;
    containerName?: string;
  };

  const body: Record<string, unknown> = { name, port };
  if (path) body.path = path;
  if (containerName) body.containerName = containerName;
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
