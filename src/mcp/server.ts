import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import process from "node:process";
import { z } from "zod";

import * as tools from "./tools.js";

const docRefSchema = {
  path: z.string().optional().describe("Filesystem path to an .edn document"),
  source: z.string().optional().describe("Full EDN document text"),
};

const parentIdSchema = {
  parentId: z.string().optional().describe(
    "Target solver component id (defaults to the document root)",
  ),
};

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "argdown-2", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "create_document",
    {
      title: "Create document",
      description:
        "Create an empty argdown-2 EDN document (path or source). Optional solver tag defaults to grounded.",
      inputSchema: {
        ...docRefSchema,
        solver: z.string().optional().describe(
          "Solver tag, e.g. casualtheorics.argdown2.solver/preferred",
        ),
        documentId: z.string().optional(),
        rootId: z.string().optional(),
      },
    },
    tools.runCreateDocument,
  );

  server.registerTool(
    "add_statement",
    {
      title: "Add statement",
      description: "Add a statement (id + prose text).",
      inputSchema: {
        ...docRefSchema,
        ...parentIdSchema,
        id: z.string(),
        text: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    tools.runAddStatement,
  );

  server.registerTool(
    "update_statement",
    {
      title: "Update statement",
      description: "Update an existing statement by id.",
      inputSchema: {
        ...docRefSchema,
        ...parentIdSchema,
        id: z.string(),
        text: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    tools.runUpdateStatement,
  );

  server.registerTool(
    "add_argument",
    {
      title: "Add argument",
      description: "Add an argument (id + prose description).",
      inputSchema: {
        ...docRefSchema,
        ...parentIdSchema,
        id: z.string(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    tools.runAddArgument,
  );

  server.registerTool(
    "add_inference",
    {
      title: "Add inference",
      description:
        "Add an inference under an argument; premises/conclusion are id-or-prose refs.",
      inputSchema: {
        ...docRefSchema,
        ...parentIdSchema,
        argumentId: z.string(),
        id: z.string(),
        premises: z.array(z.string()),
        conclusion: z.string(),
        rules: z.array(z.string()).optional(),
      },
    },
    tools.runAddInference,
  );

  server.registerTool(
    "add_relation",
    {
      title: "Add relation",
      description:
        "Add support|attack|contradiction|undercut (from/to are id-or-prose refs). Kind must be consumed by the target solver.",
      inputSchema: {
        ...docRefSchema,
        ...parentIdSchema,
        id: z.string().describe("Unique local relation id"),
        kind: z.enum(["support", "attack", "contradiction", "undercut"]),
        from: z.string(),
        to: z.string(),
      },
    },
    tools.runAddRelation,
  );

  server.registerTool(
    "add_solver",
    {
      title: "Add solver",
      description:
        "Add an empty child solver component under parentId (default root).",
      inputSchema: {
        ...docRefSchema,
        ...parentIdSchema,
        id: z.string(),
        solver: z.string().describe(
          "Solver tag, e.g. casualtheorics.argdown2.solver/grounded",
        ),
      },
    },
    tools.runAddSolver,
  );

  server.registerTool(
    "set_import",
    {
      title: "Set import",
      description:
        "Set a threshold projection for importing an immediate child solver boundary.",
      inputSchema: {
        ...docRefSchema,
        ...parentIdSchema,
        childId: z.string(),
        outAtMost: z.number(),
        inAtLeast: z.number(),
      },
    },
    tools.runSetImport,
  );

  server.registerTool(
    "remove_import",
    {
      title: "Remove import",
      description: "Remove a parent import projection for a child solver id.",
      inputSchema: {
        ...docRefSchema,
        ...parentIdSchema,
        childId: z.string(),
      },
    },
    tools.runRemoveImport,
  );

  server.registerTool(
    "remove_element",
    {
      title: "Remove element",
      description:
        "Remove a statement, argument, inference, or child solver by id.",
      inputSchema: { ...docRefSchema, ...parentIdSchema, id: z.string() },
    },
    tools.runRemoveElement,
  );

  server.registerTool(
    "remove_relation",
    {
      title: "Remove relation",
      description: "Remove a relation by its local id.",
      inputSchema: { ...docRefSchema, ...parentIdSchema, id: z.string() },
    },
    tools.runRemoveRelation,
  );

  server.registerTool(
    "list_elements",
    {
      title: "List elements",
      description:
        "List statements, arguments, inferences, relations, and nested solvers in the document.",
      inputSchema: docRefSchema,
    },
    tools.runListElements,
  );

  server.registerTool(
    "validate",
    {
      title: "Validate",
      description: "Strict-load the document and return semantic diagnostics.",
      inputSchema: docRefSchema,
    },
    tools.runValidate,
  );

  server.registerTool(
    "solve",
    {
      title: "Solve",
      description:
        "Strict-load and compute labels (grounded/bipolar) or extensions (preferred/stable/complete).",
      inputSchema: docRefSchema,
    },
    tools.runSolve,
  );

  return server;
}

export async function run(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>((resolve) => {
    server.server.onclose = () => resolve();
    process.on("SIGINT", () => {
      void server.close();
    });
    process.on("SIGTERM", () => {
      void server.close();
    });
  });
}
