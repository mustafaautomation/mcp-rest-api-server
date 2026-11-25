import {
  ContactSchema,
  ProjectSchema,
  TaskSchema,
  type Contact,
  type Project,
  type Summary,
  type Task,
} from "../api/schemas.js";

export interface Store {
  projects: Project[];
  tasks: Task[];
  contacts: Contact[];
}

const projects: Project[] = [
  {
    id: "prj_mobile",
    name: "Harborline mobile launch",
    status: "active",
    client: "Harborline",
    ownerId: "con_leo",
    dueDate: "2026-12-20",
    summary: "Ship the first TestFlight build of the field-ops app, including offline task cache.",
  },
  {
    id: "prj_northline",
    name: "Northline website redesign",
    status: "active",
    client: "Northline Goods",
    ownerId: "con_amira",
    dueDate: "2026-12-12",
    summary: "Replace the catalog site. Homepage wireframes are approved; photography is blocked.",
  },
  {
    id: "prj_reporting",
    name: "Q4 client reporting",
    status: "completed",
    client: "Northline Goods",
    ownerId: "con_amira",
    dueDate: "2026-11-15",
    summary: "Quarterly hours export and the client deck. Delivered.",
  },
  {
    id: "prj_roller",
    name: "Roller class schedule import",
    status: "active",
    client: "Harbor Fitness",
    ownerId: "con_amira",
    dueDate: "2026-12-02",
    summary: "Import the winter class CSV and resolve instructor duplicates and time zones.",
  },
  {
    id: "prj_timesheets",
    name: "Connecteam timesheet digest",
    status: "paused",
    client: "Fieldwork Co",
    ownerId: "con_leo",
    dueDate: "2027-01-15",
    summary: "Weekly digest of field hours. Paused until Fieldwork confirms job codes.",
  },
  {
    id: "prj_venues",
    name: "Venue partner onboarding",
    status: "active",
    client: "Roller Venues",
    ownerId: "con_priya",
    dueDate: "2027-01-08",
    summary: "Onboard three venue partners and send the contract template.",
  },
];

const contacts: Contact[] = [
  {
    id: "con_amira",
    name: "Amira Shah",
    email: "amira@harborline.example",
    company: "Harborline",
    role: "Producer",
    phone: "+1-555-0101",
  },
  {
    id: "con_ines",
    name: "Ines Costa",
    email: "ines@quvantic.example",
    company: "Quvantic",
    role: "Contractor",
    phone: "+1-555-0108",
  },
  {
    id: "con_jonah",
    name: "Jonah Ellis",
    email: "jonah@northline.example",
    company: "Northline Goods",
    role: "Marketing director",
    phone: "+1-555-0104",
  },
  {
    id: "con_leo",
    name: "Leo Martins",
    email: "leo@harborline.example",
    company: "Harborline",
    role: "Engineering",
    phone: "+1-555-0102",
  },
  {
    id: "con_malik",
    name: "Malik Rahman",
    email: "malik@rollervenues.example",
    company: "Roller Venues",
    role: "Partnerships",
    phone: null,
  },
  {
    id: "con_priya",
    name: "Priya Raman",
    email: "priya@harborline.example",
    company: "Harborline",
    role: "Client partner",
    phone: "+1-555-0103",
  },
  {
    id: "con_ruth",
    name: "Ruth Adeyemi",
    email: "ruth@harborfitness.example",
    company: "Harbor Fitness",
    role: "Operations",
    phone: "+1-555-0105",
  },
  {
    id: "con_sam",
    name: "Sam Okonkwo",
    email: "sam@fieldwork.example",
    company: "Fieldwork Co",
    role: "Owner",
    phone: "+1-555-0106",
  },
];

const tasks: Task[] = [
  {
    id: "tsk_mb_01",
    projectId: "prj_mobile",
    title: "Auth screen",
    status: "in_progress",
    priority: "high",
    assigneeId: "con_leo",
    dueDate: "2026-12-01",
  },
  {
    id: "tsk_mb_02",
    projectId: "prj_mobile",
    title: "Offline task cache",
    status: "todo",
    priority: "high",
    assigneeId: "con_ines",
    dueDate: "2026-12-10",
  },
  {
    id: "tsk_mb_03",
    projectId: "prj_mobile",
    title: "TestFlight notes",
    status: "todo",
    priority: "low",
    assigneeId: "con_priya",
    dueDate: null,
  },
  {
    id: "tsk_nl_01",
    projectId: "prj_northline",
    title: "Homepage wireframes",
    status: "done",
    priority: "high",
    assigneeId: "con_ines",
    dueDate: "2026-11-20",
  },
  {
    id: "tsk_nl_02",
    projectId: "prj_northline",
    title: "CMS content model",
    status: "in_progress",
    priority: "high",
    assigneeId: "con_leo",
    dueDate: "2026-11-28",
  },
  {
    id: "tsk_nl_03",
    projectId: "prj_northline",
    title: "Product photography",
    status: "blocked",
    priority: "medium",
    assigneeId: "con_jonah",
    dueDate: "2026-12-05",
  },
  {
    id: "tsk_nl_04",
    projectId: "prj_northline",
    title: "Launch checklist",
    status: "todo",
    priority: "medium",
    assigneeId: "con_amira",
    dueDate: "2026-12-12",
  },
  {
    id: "tsk_rl_01",
    projectId: "prj_roller",
    title: "Map class CSV",
    status: "in_progress",
    priority: "high",
    assigneeId: "con_leo",
    dueDate: "2026-11-27",
  },
  {
    id: "tsk_rl_02",
    projectId: "prj_roller",
    title: "Deduplicate instructors",
    status: "todo",
    priority: "medium",
    assigneeId: "con_ines",
    dueDate: "2026-11-30",
  },
  {
    id: "tsk_rl_03",
    projectId: "prj_roller",
    title: "Confirm timezone rules",
    status: "blocked",
    priority: "high",
    assigneeId: "con_ruth",
    dueDate: "2026-11-26",
  },
  {
    id: "tsk_rp_01",
    projectId: "prj_reporting",
    title: "Export Q4 hours",
    status: "done",
    priority: "medium",
    assigneeId: "con_amira",
    dueDate: "2026-11-10",
  },
  {
    id: "tsk_rp_02",
    projectId: "prj_reporting",
    title: "Send decks",
    status: "done",
    priority: "low",
    assigneeId: "con_priya",
    dueDate: "2026-11-15",
  },
  {
    id: "tsk_ts_01",
    projectId: "prj_timesheets",
    title: "Pull last 30 days",
    status: "done",
    priority: "medium",
    assigneeId: "con_leo",
    dueDate: "2026-11-01",
  },
  {
    id: "tsk_ts_02",
    projectId: "prj_timesheets",
    title: "Map job codes",
    status: "todo",
    priority: "low",
    assigneeId: "con_sam",
    dueDate: null,
  },
  {
    id: "tsk_vn_01",
    projectId: "prj_venues",
    title: "Partner list",
    status: "in_progress",
    priority: "medium",
    assigneeId: "con_malik",
    dueDate: "2026-12-18",
  },
  {
    id: "tsk_vn_02",
    projectId: "prj_venues",
    title: "Contract template",
    status: "todo",
    priority: "high",
    assigneeId: "con_priya",
    dueDate: "2027-01-06",
  },
];

function assertSeed(store: Store): void {
  const projectIds = new Set(store.projects.map((project) => project.id));
  const contactIds = new Set(store.contacts.map((contact) => contact.id));
  for (const project of store.projects) {
    ProjectSchema.parse(project);
    if (!contactIds.has(project.ownerId)) {
      throw new Error(`Seed project ${project.id} references missing owner ${project.ownerId}.`);
    }
  }
  for (const contact of store.contacts) ContactSchema.parse(contact);
  for (const task of store.tasks) {
    TaskSchema.parse(task);
    if (!projectIds.has(task.projectId)) {
      throw new Error(`Seed task ${task.id} references missing project ${task.projectId}.`);
    }
    if (task.assigneeId && !contactIds.has(task.assigneeId)) {
      throw new Error(`Seed task ${task.id} references missing assignee ${task.assigneeId}.`);
    }
  }
}

const seed: Store = { projects, tasks, contacts };
assertSeed(seed);

export function createSeed(): Store {
  return structuredClone(seed);
}

export function summarize(store: Store): Summary {
  const tasksByStatus = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const task of store.tasks) tasksByStatus[task.status] += 1;
  return {
    projects: store.projects.length,
    tasks: store.tasks.length,
    contacts: store.contacts.length,
    tasksByStatus,
  };
}
