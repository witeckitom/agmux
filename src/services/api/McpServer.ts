import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { Express } from 'express';
import { IMcpServer } from './interfaces.js';
import { ITaskService } from './interfaces.js';
import { ISkillService } from './interfaces.js';
import { logger } from '../../utils/logger.js';

/**
 * MCP server implementation using HTTP transport
 */
export class McpServer implements IMcpServer {
  private server: Server | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
  private running: boolean = false;
  private expressApp: Express | null = null;

  constructor(
    private taskService: ITaskService,
    private skillService: ISkillService,
    expressApp?: Express
  ) {
    this.expressApp = expressApp || null;
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('MCP server is already running', 'McpServer');
      return;
    }

    if (!this.expressApp) {
      throw new Error('Express app is required for HTTP MCP transport');
    }

    this.server = new Server(
      {
        name: 'agent-orch',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_task',
            description: 'Create a new task/run',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Optional name for the task',
                },
                prompt: {
                  type: 'string',
                  description: 'The prompt/instruction for the task',
                },
                baseBranch: {
                  type: 'string',
                  description: 'Base git branch (default: main)',
                },
                agentProfileId: {
                  type: 'string',
                  description: 'Agent profile ID (default: claude)',
                },
                skillId: {
                  type: 'string',
                  description: 'Optional skill ID to use',
                },
                autoStart: {
                  type: 'boolean',
                  description: 'Automatically start the task after creation (default: false)',
                },
              },
              required: ['prompt'],
            },
          },
          {
            name: 'start_task',
            description: 'Start a task by its run ID',
            inputSchema: {
              type: 'object',
              properties: {
                runId: {
                  type: 'string',
                  description: 'The run ID of the task to start',
                },
                agentType: {
                  type: 'string',
                  description: 'Optional agent type (claude or cursor)',
                  enum: ['claude', 'cursor'],
                },
              },
              required: ['runId'],
            },
          },
          {
            name: 'add_or_update_skill',
            description: 'Add or update a skill',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'The skill ID',
                },
                name: {
                  type: 'string',
                  description: 'The skill name',
                },
                content: {
                  type: 'string',
                  description: 'The skill content (markdown)',
                },
                source: {
                  type: 'string',
                  description: 'Skill source: global or local (default: local)',
                  enum: ['global', 'local'],
                },
              },
              required: ['id', 'name', 'content'],
            },
          },
          {
            name: 'get_task',
            description: 'Get a task by its run ID',
            inputSchema: {
              type: 'object',
              properties: {
                runId: {
                  type: 'string',
                  description: 'The run ID of the task to retrieve',
                },
              },
              required: ['runId'],
            },
          },
          {
            name: 'list_tasks',
            description: 'Get all tasks',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'create_task': {
            const task = await this.taskService.createTask({
              name: args?.name as string | undefined,
              prompt: args?.prompt as string,
              baseBranch: args?.baseBranch as string | undefined,
              agentProfileId: args?.agentProfileId as string | undefined,
              skillId: args?.skillId as string | undefined,
            });

            // Auto-start the task if requested
            if (args?.autoStart === true) {
              await this.taskService.startTask(task.id);
            }

            // Re-fetch task to get updated status if auto-started
            const updatedTask = args?.autoStart === true
              ? await this.taskService.getTask(task.id) || task
              : task;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(updatedTask, null, 2),
                },
              ],
            };
          }

          case 'start_task': {
            const runId = args?.runId as string;
            const agentType = args?.agentType as string | undefined;
            await this.taskService.startTask(runId, agentType);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, runId }, null, 2),
                },
              ],
            };
          }

          case 'add_or_update_skill': {
            const skill = await this.skillService.addOrUpdateSkill({
              id: args?.id as string,
              name: args?.name as string,
              content: args?.content as string,
              source: args?.source as 'global' | 'local' | undefined,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(skill, null, 2),
                },
              ],
            };
          }

          case 'get_task': {
            const runId = args?.runId as string;
            const task = await this.taskService.getTask(runId);
            if (!task) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ error: 'Task not found' }, null, 2),
                  },
                ],
                isError: true,
              };
            }
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(task, null, 2),
                },
              ],
            };
          }

          case 'list_tasks': {
            const tasks = await this.taskService.getAllTasks();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(tasks, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        logger.error(`Error executing tool ${name}`, 'McpServer', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: error.message }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    // Error handler
    this.server.onerror = (error) => {
      logger.error('MCP server error', 'McpServer', { error });
    };

    // Create HTTP transport in stateless mode (no session management)
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    // Mount MCP endpoint on Express app
    this.expressApp.post('/mcp', async (req, res) => {
      try {
        await this.transport!.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error('Error handling MCP request', 'McpServer', { error });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    // Also support GET for SSE connections
    this.expressApp.get('/mcp', async (req, res) => {
      try {
        await this.transport!.handleRequest(req, res);
      } catch (error) {
        logger.error('Error handling MCP GET request', 'McpServer', { error });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    // Connect server to transport
    await this.server.connect(this.transport);
    this.running = true;
    logger.info('MCP server started on /mcp endpoint', 'McpServer');
  }

  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    try {
      if (this.transport) {
        await this.transport.close();
      }
      this.running = false;
      this.transport = null;
      logger.info('MCP server stopped', 'McpServer');
    } catch (error) {
      logger.error('Error stopping MCP server', 'McpServer', { error });
      throw error;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
