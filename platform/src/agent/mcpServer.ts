import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const REG_TOKEN = process.env.SRIJAN_REG_TOKEN || '';
const PLATFORM_URL = process.env.SRIJAN_PLATFORM_URL || 'http://localhost:8080';
const WORKSPACE = process.env.SRIJAN_WORKSPACE || '';
const SESSION_ID = process.env.SRIJAN_SESSION_ID || '';

const server = new Server(
  { name: 'srijan', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'register_app',
      description:
        'Register a running service to get a public URL via Caddy reverse proxy. Call this ONLY when the user explicitly asks for a public URL. The service must expose a host port (via ports: in docker-compose.yml). Pass the HOST-mapped port (left side of the mapping, e.g. 3000 for "3000:3000").',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short alphanumeric app name, e.g. "myapp"',
          },
          port: {
            type: 'number',
            description: 'Host-mapped port the service is exposed on (left side of -p / ports mapping, e.g. 3000 for "3000:3000")',
          },
          path: {
            type: 'string',
            description: 'URL path prefix (defaults to /<name>)',
          },
        },
        required: ['name', 'port'],
      },
    },
    {
      name: 'propose_plan',
      description: 'Show the user a structured execution plan before starting work on a complex task. Call this when a task has 3 or more distinct steps. The plan will be displayed to the user before you begin execution.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short title for the plan, e.g. "Build user auth system"',
          },
          steps: {
            type: 'array',
            description: 'Ordered list of steps in the plan',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique step identifier, e.g. "step-1"' },
                title: { type: 'string', description: 'Short step title' },
                description: { type: 'string', description: 'Detailed description of what this step does' },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'IDs of steps that must complete before this one',
                },
              },
              required: ['id', 'title'],
            },
          },
        },
        required: ['title', 'steps'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'propose_plan') {
    const { title, steps } = req.params.arguments as { title: string; steps: Array<{ id: string; title: string; description?: string; dependencies?: string[] }> };

    if (!SESSION_ID) {
      return { content: [{ type: 'text', text: 'Session ID not available' }], isError: true };
    }

    try {
      const res = await fetch(`${PLATFORM_URL}/api/sessions/${SESSION_ID}/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Registration-Token': REG_TOKEN,
        },
        body: JSON.stringify({ title, steps }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        return { content: [{ type: 'text', text: data?.error?.message || 'Plan proposal failed' }], isError: true };
      }
      return { content: [{ type: 'text', text: `Plan "${title}" with ${steps.length} steps has been shown to the user. Now proceed to execute the plan step by step.` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Plan proposal error: ${err.message}` }], isError: true };
    }
  }

  if (req.params.name === 'register_app') {
    const { name, port, path } = req.params.arguments as {
      name: string;
      port: number;
      path?: string;
    };

    const body: Record<string, unknown> = { name, port };
    if (path) body.path = path;
    if (WORKSPACE) body.workspaceName = WORKSPACE;

    try {
      const res = await fetch(`${PLATFORM_URL}/forge/api/apps/register`, {
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
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
