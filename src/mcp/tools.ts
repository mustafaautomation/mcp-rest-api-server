import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RestClient } from "../api/client.js";
import { ApiError } from "../api/errors.js";
import type { Page } from "../api/pagination.js";
import {
  ContactSchema,
  ProjectSchema,
  SummarySchema,
  TaskPrioritySchema,
  TaskSchema,
  TaskStatusSchema,
} from "../api/schemas.js";
import type { AppConfig } from "../config.js";
import { runTool } from "./results.js";

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const CREATE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

const UPDATE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const cursorField = z
  .string()
  .min(1)
  .optional()
  .describe("Opaque nextCursor from the previous page. Omit it to start at the first page.");

const limitField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe("Page size from 1 to 100. Defaults to 20.");

const pageOutput = {
  limit: z.number().int(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
};

function pageFields<T>(page: Page<T>): { limit: number; hasMore: boolean; nextCursor: string | null } {
  return { limit: page.page.limit, hasMore: page.page.hasMore, nextCursor: page.page.nextCursor };
}

/**
 * Read tools are always registered. Write tools exist only when read-only mode is off.
 * The REST client also refuses mutating methods in read-only mode.
 */
export function registerTools(server: McpServer, client: RestClient, config: AppConfig): void {
  const secrets = [config.apiKey, config.httpToken ?? ""];

  server.registerTool(
    "get_workspace_summary",
    {
      title: "Workspace summary",
      description: "Counts of Harborline projects, tasks, and contacts, including tasks by status. Read-only.",
      inputSchema: {},
      outputSchema: {
        summary: SummarySchema,
        readOnly: z.boolean(),
      },
      annotations: READ,
    },
    async () =>
      runTool(secrets, async () => {
        const summary = await client.getSummary();
        return { summary, readOnly: config.readOnly };
      }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List Harborline projects one page at a time. Pass nextCursor back as cursor for the next page.",
      inputSchema: { cursor: cursorField, limit: limitField },
      outputSchema: { projects: z.array(ProjectSchema), ...pageOutput },
      annotations: READ,
    },
    async ({ cursor, limit }) =>
      runTool(secrets, async () => {
        const page = await client.listProjects({ cursor, limit: limit ?? 20 });
        return { projects: page.data, ...pageFields(page) };
      }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description: "Fetch one Harborline project by id, for example prj_northline.",
      inputSchema: {
        projectId: z.string().min(1).describe("Project id returned by list_projects."),
      },
      outputSchema: { project: ProjectSchema },
      annotations: READ,
    },
    async ({ projectId }) =>
      runTool(secrets, async () => ({ project: await client.getProject(projectId) })),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description: "List tasks. Filter by projectId, status, or assigneeId. Pages use cursor and limit.",
      inputSchema: {
        cursor: cursorField,
        limit: limitField,
        projectId: z.string().min(1).optional().describe("Only tasks on this project."),
        status: TaskStatusSchema.optional().describe("todo, in_progress, blocked, or done."),
        assigneeId: z.string().min(1).optional().describe("Only tasks assigned to this contact id."),
      },
      outputSchema: { tasks: z.array(TaskSchema), ...pageOutput },
      annotations: READ,
    },
    async ({ cursor, limit, projectId, status, assigneeId }) =>
      runTool(secrets, async () => {
        const page = await client.listTasks({
          cursor,
          limit: limit ?? 20,
          projectId,
          status,
          assigneeId,
        });
        return { tasks: page.data, ...pageFields(page) };
      }),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get task",
      description: "Fetch one task by id.",
      inputSchema: { taskId: z.string().min(1).describe("Task id returned by list_tasks.") },
      outputSchema: { task: TaskSchema },
      annotations: READ,
    },
    async ({ taskId }) => runTool(secrets, async () => ({ task: await client.getTask(taskId) })),
  );

  server.registerTool(
    "list_contacts",
    {
      title: "List contacts",
      description: "List contacts. Optional q matches name, email, company, or role. Pages use cursor and limit.",
      inputSchema: {
        cursor: cursorField,
        limit: limitField,
        q: z.string().min(1).max(120).optional().describe("Case-insensitive search text."),
      },
      outputSchema: { contacts: z.array(ContactSchema), ...pageOutput },
      annotations: READ,
    },
    async ({ cursor, limit, q }) =>
      runTool(secrets, async () => {
        const page = await client.listContacts({ cursor, limit: limit ?? 20, q });
        return { contacts: page.data, ...pageFields(page) };
      }),
  );

  server.registerTool(
    "get_contact",
    {
      title: "Get contact",
      description: "Fetch one contact by id.",
      inputSchema: { contactId: z.string().min(1).describe("Contact id returned by list_contacts.") },
      outputSchema: { contact: ContactSchema },
      annotations: READ,
    },
    async ({ contactId }) =>
      runTool(secrets, async () => ({ contact: await client.getContact(contactId) })),
  );

  if (config.readOnly) return;

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: "Create a task on an existing project. Disabled when the server is read-only.",
      inputSchema: {
        projectId: z.string().min(1).describe("Project that will own the task."),
        title: z.string().min(1).max(200).describe("Short task title."),
        status: TaskStatusSchema.optional().describe("Defaults to todo."),
        priority: TaskPrioritySchema.optional().describe("Defaults to medium."),
        assigneeId: z.string().min(1).nullable().optional().describe("Contact id, or null to leave it unassigned."),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional()
          .describe("Due date as YYYY-MM-DD, or null."),
      },
      outputSchema: { task: TaskSchema },
      annotations: CREATE,
    },
    async (input) => runTool(secrets, async () => ({ task: await client.createTask(input) })),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description: "Update one or more fields on a task. Confirm the change with the user before calling it.",
      inputSchema: {
        taskId: z.string().min(1).describe("Task to update."),
        title: z.string().min(1).max(200).optional(),
        status: TaskStatusSchema.optional(),
        priority: TaskPrioritySchema.optional(),
        assigneeId: z.string().min(1).nullable().optional(),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      },
      outputSchema: { task: TaskSchema },
      annotations: UPDATE,
    },
    async ({ taskId, ...patch }) =>
      runTool(secrets, async () => {
        if (Object.values(patch).every((value) => value === undefined)) {
          throw new ApiError({
            code: "validation",
            message: "Provide at least one field to update.",
            retryable: false,
            probablySent: false,
          });
        }
        return { task: await client.updateTask(taskId, patch) };
      }),
  );

  server.registerTool(
    "create_contact",
    {
      title: "Create contact",
      description: "Create a contact. Email must be unique. Disabled when the server is read-only.",
      inputSchema: {
        name: z.string().min(1).max(120),
        email: z.string().email().describe("Unique email address."),
        company: z.string().min(1).max(120),
        role: z.string().min(1).max(120),
        phone: z.string().min(1).max(40).nullable().optional(),
      },
      outputSchema: { contact: ContactSchema },
      annotations: CREATE,
    },
    async (input) => runTool(secrets, async () => ({ contact: await client.createContact(input) })),
  );
}
