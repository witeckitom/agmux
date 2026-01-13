import { DatabaseManager } from '../../db/database.js';
import { TaskExecutor } from '../TaskExecutor.js';
import { Run } from '../../models/types.js';
import { Skill } from '../../utils/skillsLoader.js';

/**
 * Interface for HTTP API server
 */
export interface IHttpApiServer {
  /**
   * Start the HTTP server on the specified port
   */
  start(port: number): Promise<void>;
  
  /**
   * Stop the HTTP server
   */
  stop(): Promise<void>;
  
  /**
   * Get the port the server is listening on
   */
  getPort(): number | null;
  
  /**
   * Get the Express app instance for mounting additional routes
   */
  getApp(): any;
}

/**
 * Interface for MCP server
 */
export interface IMcpServer {
  /**
   * Start the MCP server
   */
  start(): Promise<void>;
  
  /**
   * Stop the MCP server
   */
  stop(): Promise<void>;
  
  /**
   * Check if the server is running
   */
  isRunning(): boolean;
}

/**
 * Interface for task management operations
 */
export interface ITaskService {
  /**
   * Create a new task
   */
  createTask(params: CreateTaskParams): Promise<Run>;
  
  /**
   * Start a task by runId
   */
  startTask(runId: string, agentType?: string): Promise<void>;
  
  /**
   * Get a task by runId
   */
  getTask(runId: string): Promise<Run | null>;
  
  /**
   * Get all tasks
   */
  getAllTasks(): Promise<Run[]>;
}

/**
 * Interface for skill management operations
 */
export interface ISkillService {
  /**
   * Add or update a skill
   */
  addOrUpdateSkill(params: AddOrUpdateSkillParams): Promise<Skill>;
  
  /**
   * Get a skill by ID
   */
  getSkill(skillId: string): Promise<Skill | null>;
  
  /**
   * Get all skills
   */
  getAllSkills(): Promise<Skill[]>;
}

/**
 * Parameters for creating a task
 */
export interface CreateTaskParams {
  name?: string;
  prompt: string;
  baseBranch?: string;
  agentProfileId?: string;
  skillId?: string;
}

/**
 * Parameters for adding or updating a skill
 */
export interface AddOrUpdateSkillParams {
  id: string;
  name: string;
  content: string;
  source?: 'global' | 'local';
}
