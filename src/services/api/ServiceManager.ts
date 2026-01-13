import { DatabaseManager } from '../../db/database.js';
import { TaskExecutor } from '../TaskExecutor.js';
import { HttpApiServer } from './HttpApiServer.js';
import { McpServer } from './McpServer.js';
import { TaskService } from './TaskService.js';
import { SkillService } from './SkillService.js';
import { IHttpApiServer } from './interfaces.js';
import { IMcpServer } from './interfaces.js';
import { logger } from '../../utils/logger.js';

/**
 * Manages HTTP API and MCP servers
 */
export class ServiceManager {
  private httpServer: IHttpApiServer;
  private mcpServer: IMcpServer;
  private httpPort: number;
  private mcpEnabled: boolean;

  constructor(
    database: DatabaseManager,
    taskExecutor: TaskExecutor,
    projectRoot: string,
    httpPort: number = 3000,
    mcpEnabled: boolean = true
  ) {
    const taskService = new TaskService(database, taskExecutor);
    const skillService = new SkillService(projectRoot);

    this.httpServer = new HttpApiServer(taskService, skillService);
    // Pass Express app to MCP server so it can mount on the same HTTP server
    this.mcpServer = new McpServer(taskService, skillService, this.httpServer.getApp());
    this.httpPort = httpPort;
    this.mcpEnabled = mcpEnabled;
  }

  /**
   * Start both HTTP API and MCP servers
   */
  async start(): Promise<void> {
    try {
      // Start HTTP API server first
      await this.httpServer.start(this.httpPort);
      logger.info(`HTTP API server started on port ${this.httpPort}`, 'ServiceManager');

      // Start MCP server if enabled (mounts on same Express app)
      if (this.mcpEnabled) {
        try {
          await this.mcpServer.start();
          logger.info('MCP server started on /mcp endpoint', 'ServiceManager');
        } catch (error) {
          logger.warn('Failed to start MCP server', 'ServiceManager', { error });
          // Don't fail if MCP server can't start
        }
      }
    } catch (error) {
      logger.error('Failed to start servers', 'ServiceManager', { error });
      throw error;
    }
  }

  /**
   * Stop both servers
   */
  async stop(): Promise<void> {
    try {
      if (this.mcpEnabled && this.mcpServer.isRunning()) {
        await this.mcpServer.stop();
        logger.info('MCP server stopped', 'ServiceManager');
      }
      await this.httpServer.stop();
      logger.info('HTTP API server stopped', 'ServiceManager');
    } catch (error) {
      logger.error('Error stopping servers', 'ServiceManager', { error });
      throw error;
    }
  }

  /**
   * Get the HTTP API server port
   */
  getHttpPort(): number | null {
    return this.httpServer.getPort();
  }

  /**
   * Check if MCP server is running
   */
  isMcpRunning(): boolean {
    return this.mcpServer.isRunning();
  }
}
