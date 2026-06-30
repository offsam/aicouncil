export const MAYOR_GITHUB_TOOL_DEFINITIONS = [
  {
    name: "github_get_repo_tree",
    description: "Get list of files in a GitHub repository",
    input_schema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (username or org)" },
        repo: { type: "string", description: "Repository name" },
        branch: { type: "string", description: "Branch name, defaults to main" },
      },
      required: [],
    },
  },
  {
    name: "github_read_file",
    description: "Read contents of a specific file from a GitHub repository",
    input_schema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string", description: "File path within the repository" },
        branch: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "github_search_code",
    description: "Search for code within a GitHub repository",
    input_schema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
] as const;
