---
name: context7
description: Fetch current documentation for a library, framework, SDK, API, CLI tool or cloud service before answering. Use whenever the question concerns API syntax, configuration, version migration, installation, CLI usage or library-specific debugging — even for well-known libraries like React, Next.js, Prisma, Express, Tailwind, Django or Spring Boot, because training data may not reflect recent changes. Prefer this over a web search for library documentation.
---

# Context7

Up-to-date library documentation, served over MCP through the `mcp` proxy
tool that `pi-mcp-adapter` registers. The server is declared in this
profile's `mcp.json` and starts lazily on first use.

## When to use this

Any question about a library, framework, SDK, API, CLI tool or cloud
service. That includes API syntax, configuration, version migration,
library-specific debugging, installation instructions and CLI usage. Use it
even when you think you know the answer.

## When not to use this

Refactoring, writing scripts from scratch, debugging business logic, code
review, or general programming concepts. None of those are documentation
questions.

## Steps

1. Resolve the library ID first, unless the user gave you an exact
   `/org/project` ID:

   ```
   mcp({ tool: "context7:resolve-library-id", args: { libraryName: "<name>", question: "<the full question>" } })
   ```

2. Pick the best match on: exact name match, description relevance, snippet
   count, source reputation, benchmark score. If the results look wrong, try
   an alternate spelling — `next.js`, not `nextjs`.

3. Query with the selected ID and the **full question**, not a single word:

   ```
   mcp({ tool: "context7:query-docs", args: { libraryId: "/org/project", question: "<the full question>" } })
   ```

4. Answer from the returned documentation.

## If the tool is missing

`mcp` is registered by `pi-mcp-adapter`, pinned in `settings.json`. If the
tool does not exist, the package failed to install — say so rather than
falling back to memory, then continue with a web search and label the answer
as potentially stale.
