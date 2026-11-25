import { z } from "zod";

export const ProjectStatusSchema = z.enum(["active", "paused", "completed"]);
export const TaskStatusSchema = z.enum(["todo", "in_progress", "blocked", "done"]);
export const TaskPrioritySchema = z.enum(["low", "medium", "high"]);

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: ProjectStatusSchema,
  client: z.string(),
  ownerId: z.string(),
  dueDate: z.string(),
  summary: z.string(),
});

export const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  assigneeId: z.string().nullable(),
  dueDate: z.string().nullable(),
});

export const ContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  company: z.string(),
  role: z.string(),
  phone: z.string().nullable(),
});

export const SummarySchema = z.object({
  projects: z.number().int(),
  tasks: z.number().int(),
  contacts: z.number().int(),
  tasksByStatus: z.object({
    todo: z.number().int(),
    in_progress: z.number().int(),
    blocked: z.number().int(),
    done: z.number().int(),
  }),
});

export const PageMetaSchema = z.object({
  limit: z.number().int(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    page: PageMetaSchema,
  });
}

export function entitySchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: item,
  });
}

export const CreateTaskSchema = z
  .object({
    projectId: z.string().min(1).max(80),
    title: z.string().min(1).max(200),
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    assigneeId: z.string().min(1).max(80).nullable().optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

export const UpdateTaskSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    assigneeId: z.string().min(1).max(80).nullable().optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update.",
  });

export const CreateContactSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(200),
    company: z.string().min(1).max(120),
    role: z.string().min(1).max(120),
    phone: z.string().min(1).max(40).nullable().optional(),
  })
  .strict();

export type Project = z.infer<typeof ProjectSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CreateContactInput = z.infer<typeof CreateContactSchema>;
