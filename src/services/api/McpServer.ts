import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { IMcpServer } from './interfaces.js';
import { ITaskService } from './interfaces.js';
import { ISkillService } from './interfaces.js';
import { logger } from '../../utils/logger.js';

/**
 * MCP server implementation
 */
export class McpServer implements IMcpServer {
  private server: Server | null = null;
  private transport: StdioServerTransport | null = null;
  private running: boolean = false;

  constructor(
    private taskService: ITaskService,
    private skillService: ISkillService
  ) {}

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('MCP server is already running', 'McpServer');
      return;
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
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(task, null, 2),
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

    // Start the server
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    this.running = true;
    logger.info('MCP server started', 'McpServer');
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
