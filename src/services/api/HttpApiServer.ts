import express, { Express, Request, Response } from 'express';
import { IHttpApiServer } from './interfaces.js';
import { ITaskService } from './interfaces.js';
import { ISkillService } from './interfaces.js';
import { logger } from '../../utils/logger.js';

/**
 * HTTP API server implementation using Express
 */
export class HttpApiServer implements IHttpApiServer {
  private app: Express;
  private server: any = null;
  private port: number | null = null;

  constructor(
    private taskService: ITaskService,
    private skillService: ISkillService
  ) {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Task routes
    this.app.post('/api/tasks', async (req: Request, res: Response) => {
      try {
        const task = await this.taskService.createTask(req.body);
        res.status(201).json(task);
      } catch (error: any) {
        logger.error('Error creating task', 'HttpApiServer', { error });
        res.status(400).json({ error: error.message });
      }
    });

    this.app.get('/api/tasks', async (req: Request, res: Response) => {
      try {
        const tasks = await this.taskService.getAllTasks();
        res.json(tasks);
      } catch (error: any) {
        logger.error('Error getting tasks', 'HttpApiServer', { error });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/tasks/:id', async (req: Request, res: Response) => {
      try {
        const task = await this.taskService.getTask(req.params.id);
        if (!task) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }
        res.json(task);
      } catch (error: any) {
        logger.error('Error getting task', 'HttpApiServer', { error });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/tasks/:id/start', async (req: Request, res: Response) => {
      try {
        const { agentType } = req.body;
        await this.taskService.startTask(req.params.id, agentType);
        res.json({ success: true });
      } catch (error: any) {
        logger.error('Error starting task', 'HttpApiServer', { error });
        res.status(400).json({ error: error.message });
      }
    });

    // Skill routes
    this.app.post('/api/skills', async (req: Request, res: Response) => {
      try {
        const skill = await this.skillService.addOrUpdateSkill(req.body);
        res.status(201).json(skill);
      } catch (error: any) {
        logger.error('Error adding/updating skill', 'HttpApiServer', { error });
        res.status(400).json({ error: error.message });
      }
    });

    this.app.get('/api/skills', async (req: Request, res: Response) => {
      try {
        const skills = await this.skillService.getAllSkills();
        res.json(skills);
      } catch (error: any) {
        logger.error('Error getting skills', 'HttpApiServer', { error });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/skills/:id', async (req: Request, res: Response) => {
      try {
        const skill = await this.skillService.getSkill(req.params.id);
        if (!skill) {
          res.status(404).json({ error: 'Skill not found' });
          return;
        }
        res.json(skill);
      } catch (error: any) {
        logger.error('Error getting skill', 'HttpApiServer', { error });
        res.status(500).json({ error: error.message });
      }
    });
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(port, () => {
          this.port = port;
          logger.info(`HTTP API server started on port ${port}`, 'HttpApiServer');
          resolve();
        });
        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${port} is already in use`, 'HttpApiServer');
            reject(new Error(`Port ${port} is already in use`));
          } else {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((error: any) => {
        if (error) {
          logger.error('Error stopping HTTP server', 'HttpApiServer', { error });
          reject(error);
        } else {
          logger.info('HTTP API server stopped', 'HttpApiServer');
          this.port = null;
          resolve();
        }
      });
    });
  }

  getPort(): number | null {
    return this.port;
  }
}
