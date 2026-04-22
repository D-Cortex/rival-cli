/**
 * Rival MCP Server — CortexOne hosted function.
 *
 * Runtime constraints: synchronous only, no module.exports, no require/import.
 * fetch() is synchronous in this runtime (returns response directly, not a Promise).
 *
 * Auth: set RIVAL_TOKEN and RIVAL_ORG_ID as function environment variables,
 *       or pass them as "token" / "org_id" in each tool call's arguments.
 */

"use strict";

var DEFAULT_API_URL = "https://cortexone-api-dev.rival.io";

// ─── helpers ─────────────────────────────────────────────────────────────────

function mcpResult(id, data) {
  return { jsonrpc: "2.0", id: id, result: data };
}

function mcpError(id, code, message) {
  return { jsonrpc: "2.0", id: id, error: { code: code, message: message } };
}

function toolOk(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function toolFail(message) {
  return { content: [{ type: "text", text: "Error: " + message }], isError: true };
}

function getAuth(args) {
  var token = (args && args.token) || (typeof process !== "undefined" && process.env && process.env.RIVAL_TOKEN) || "";
  var orgId = (args && args.org_id) || (typeof process !== "undefined" && process.env && process.env.RIVAL_ORG_ID) || "";
  var apiUrl = (args && args.api_url) || DEFAULT_API_URL;
  if (!token) throw new Error("No auth token. Set RIVAL_TOKEN env var or pass 'token' argument.");
  if (!orgId) throw new Error("No org ID. Set RIVAL_ORG_ID env var or pass 'org_id' argument.");
  return { token: token, orgId: orgId, apiUrl: apiUrl };
}

function apiFetch(auth, method, path, body) {
  var url = auth.apiUrl + path;
  var opts = {
    method: method,
    headers: {
      "Authorization": "Bearer " + auth.token,
      "X-Organization-ID": auth.orgId,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  var res = fetch(url, opts);
  var text = res.text();
  var data;
  try { data = JSON.parse(text); } catch (_) { data = text; }
  if (!res.ok) {
    throw new Error("API " + res.status + ": " + (typeof data === "object" ? JSON.stringify(data) : data));
  }
  return data;
}

// ─── tool definitions ─────────────────────────────────────────────────────────

var TOOLS = [
  {
    name: "rival_whoami",
    description: "Show the currently authenticated Rival user and their organizations. Verify login state before performing other operations.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Rival API token (overrides RIVAL_TOKEN env var)" },
        org_id: { type: "string", description: "Organization ID (overrides RIVAL_ORG_ID env var)" },
        api_url: { type: "string", description: "Override API base URL (optional)" },
      },
    },
  },
  {
    name: "rival_list_functions",
    description: "List all functions in the authenticated organization. Returns function_id, name, slug, type, visibility, and versions.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
    },
  },
  {
    name: "rival_get_metadata",
    description: "Fetch available runtimes, categories, sectors, compute types, and tool types. Call this before rival_create_function to get valid option values.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
    },
  },
  {
    name: "rival_get_versions",
    description: "List all versions of a function including state, runtime, and files.",
    inputSchema: {
      type: "object",
      properties: {
        org_slug: { type: "string", description: "Organization slug" },
        fn_slug: { type: "string", description: "Function slug" },
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
      required: ["org_slug", "fn_slug"],
    },
  },
  {
    name: "rival_get_function",
    description: "Get details for a specific function by org_slug and fn_slug, including its latest code.",
    inputSchema: {
      type: "object",
      properties: {
        org_slug: { type: "string", description: "Organization slug" },
        fn_slug: { type: "string", description: "Function slug" },
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
      required: ["org_slug", "fn_slug"],
    },
  },
  {
    name: "rival_create_function",
    description: "Create a new Rival function. Call rival_get_metadata first to get valid runtime/category/sector/compute_type values.",
    inputSchema: {
      type: "object",
      properties: {
        function_name: { type: "string", description: "Display name for the function" },
        short_description: { type: "string", description: "One-line description" },
        runtime: { type: "string", description: "Runtime identifier, e.g. \"python:3.13\", \"javascript\", \"lua\"" },
        type: { type: "string", description: "Tool type from rival_get_metadata (e.g. \"function\")" },
        compute_type: { type: "string", description: "Compute type from rival_get_metadata" },
        category_id: { type: "string", description: "Single category_id from rival_get_metadata" },
        sector_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of sector_ids from rival_get_metadata (1-4 items)",
        },
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
      required: ["function_name", "short_description", "runtime", "compute_type", "category_id", "sector_ids"],
    },
  },
  {
    name: "rival_push",
    description: "Push code files to a Rival function version. Provide files as [{path, content}] objects. Only private functions can be pushed to.",
    inputSchema: {
      type: "object",
      properties: {
        function_id: { type: "string", description: "Function ID to push to" },
        version: { type: "string", description: "Version string (e.g. \"Draft\", \"v1\"). Defaults to \"Draft\"." },
        files: {
          type: "array",
          description: "Files to push",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path/name (e.g. handler.js)" },
              content: { type: "string", description: "File content as string" },
            },
            required: ["path", "content"],
          },
        },
        digital_asset_id: { type: "string", description: "Digital asset ID (Storm functions only, optional)" },
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
      required: ["function_id", "files"],
    },
  },
  {
    name: "rival_switch_org",
    description: "List available organizations or identify a target org to switch to. Omit org_id to list all orgs. Returns the org_id to use in subsequent calls.",
    inputSchema: {
      type: "object",
      properties: {
        org_id: { type: "string", description: "Organization ID to switch to. Omit to list available orgs." },
        token: { type: "string" },
        org_id_auth: { type: "string", description: "Auth org ID for API calls (if different from org to switch to)" },
        api_url: { type: "string" },
      },
    },
  },
  {
    name: "rival_publish_function",
    description: "Publish a function version, making it publicly available.",
    inputSchema: {
      type: "object",
      properties: {
        function_id: { type: "string", description: "Function ID to publish" },
        version: { type: "string", description: "Version to publish" },
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
      required: ["function_id", "version"],
    },
  },
  {
    name: "rival_execute_function",
    description: "Execute a Rival function with the given payload.",
    inputSchema: {
      type: "object",
      properties: {
        org_slug: { type: "string", description: "Organization slug" },
        fn_slug: { type: "string", description: "Function slug" },
        payload: { type: "object", description: "Payload to pass to the function" },
        version: { type: "string", description: "Version to execute (optional, defaults to latest)" },
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
      required: ["org_slug", "fn_slug"],
    },
  },
  {
    name: "rival_update_function",
    description: "Update a function's metadata and documentation. long_description is an object with keys: what_it_does, how_it_works, strengths (array), limitations (array), long_description (markdown) — auto-stringified before sending.",
    inputSchema: {
      type: "object",
      properties: {
        org_slug: { type: "string", description: "Organization slug" },
        fn_slug: { type: "string", description: "Function slug" },
        function_id: { type: "string", description: "Function ID" },
        function_name: { type: "string", description: "Display name" },
        short_description: { type: "string", description: "One-line description" },
        category_ids: { type: "array", items: { type: "string" }, description: "Category IDs" },
        sector_ids: { type: "array", items: { type: "string" }, description: "Sector IDs" },
        tag_ids: { type: "array", items: { type: "string" }, description: "Tag IDs" },
        long_description: {
          type: "object",
          description: "Documentation object",
          properties: {
            what_it_does: { type: "string" },
            how_it_works: { type: "string" },
            strengths: { type: "array", items: { type: "string" } },
            limitations: { type: "array", items: { type: "string" } },
            long_description: { type: "string", description: "Markdown documentation" },
          },
        },
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
      required: ["org_slug", "fn_slug", "function_id"],
    },
  },
  {
    name: "rival_create_test_event",
    description: "Send a single test event to a Rival function to trigger execution with a specific payload.",
    inputSchema: {
      type: "object",
      properties: {
        function_id: { type: "string", description: "Function ID to send the event to" },
        event_name: { type: "string", description: "Event name (e.g. \"user.signup\", \"order.placed\")" },
        version: { type: "string", description: "Function version to target (e.g. \"Draft\", \"v1\")" },
        event_id: { type: "string", description: "Optional unique event ID" },
        event_data: { type: "object", description: "Arbitrary event payload object", additionalProperties: true },
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
      required: ["function_id", "event_name", "version"],
    },
  },
  {
    name: "rival_create_test_events_bulk",
    description: "Send multiple test events to Rival functions in a single request. Each event can target a different function or version.",
    inputSchema: {
      type: "object",
      properties: {
        events: {
          type: "array",
          description: "Array of events to send",
          items: {
            type: "object",
            properties: {
              function_id: { type: "string" },
              event_name: { type: "string" },
              version: { type: "string" },
              event_data: { type: "object", additionalProperties: true },
            },
            required: ["function_id", "event_name", "version"],
          },
        },
        token: { type: "string" },
        org_id: { type: "string" },
        api_url: { type: "string" },
      },
      required: ["events"],
    },
  },
];

// ─── tool handlers (all synchronous) ─────────────────────────────────────────

function handleWhoami(args) {
  try {
    var auth = getAuth(args);
    var data = apiFetch(auth, "GET", "/api/v1/users/me");
    return toolOk(data);
  } catch (e) { return toolFail(e.message); }
}

function handleListFunctions(args) {
  try {
    var auth = getAuth(args);
    var data = apiFetch(auth, "GET", "/api/v1/functions/summary");
    return toolOk(data);
  } catch (e) { return toolFail(e.message); }
}

function handleGetMetadata(args) {
  try {
    var auth = getAuth(args);
    var data = apiFetch(auth, "GET", "/api/v1/function/public/metadata");
    return toolOk(data);
  } catch (e) { return toolFail(e.message); }
}

function handleGetVersions(args) {
  try {
    var auth = getAuth(args);
    var data = apiFetch(auth, "GET", "/api/v1/function/" + args.org_slug + "/" + args.fn_slug + "/details");
    return toolOk(data);
  } catch (e) { return toolFail(e.message); }
}

function handleGetFunction(args) {
  try {
    var auth = getAuth(args);
    var data = apiFetch(auth, "GET", "/api/v1/function/" + args.org_slug + "/" + args.fn_slug + "/details");
    return toolOk(data);
  } catch (e) { return toolFail(e.message); }
}

function handleCreateFunction(args) {
  try {
    var auth = getAuth(args);
    var body = {
      function_name: args.function_name,
      short_description: args.short_description,
      runtime: args.runtime,
      type: args.type || "function",
      compute_type: args.compute_type,
      category_ids: args.category_id,
      sector_ids: Array.isArray(args.sector_ids) ? args.sector_ids.join(",") : args.sector_ids,
    };
    var data = apiFetch(auth, "POST", "/api/v1/functions", body);
    return toolOk(data);
  } catch (e) { return toolFail(e.message); }
}

function handlePush(args) {
  try {
    var auth = getAuth(args);
    var files = (args.files || []).map(function(f) {
      return {
        path: f.path,
        meta: { name: f.path.split("/").pop(), mime: "text/plain" },
        data: f.content !== undefined ? f.content : f.data,
      };
    });
    if (!files.length) return toolFail("No files provided.");
    var version = args.version || "Draft";
    var body = { files: files, version: version };
    if (args.digital_asset_id) body.digital_asset_id = args.digital_asset_id;
    var data = apiFetch(auth, "PUT", "/api/v1/functions/" + args.function_id + "/save-version", body);
    return toolOk({
      success: true,
      function_id: args.function_id,
      version: version,
      files_pushed: files.map(function(f) { return f.path; }),
      response: data,
    });
  } catch (e) { return toolFail(e.message); }
}

function handleSwitchOrg(args) {
  try {
    var authArgs = { token: args.token, org_id: args.org_id_auth || args.org_id, api_url: args.api_url };
    var auth = getAuth(authArgs);
    var data = apiFetch(auth, "GET", "/api/v1/users/me");
    var orgs = (data.data && data.data.organizations) || [];
    if (!args.org_id) {
      return toolOk({
        organizations: orgs.map(function(o) {
          return {
            organization_id: o.organization_id,
            organization_name: o.organization_name,
            organization_slug: o.organization_slug,
            role: o.role,
          };
        }),
        hint: "Call rival_switch_org again with org_id to confirm the target org.",
      });
    }
    var target = null;
    for (var i = 0; i < orgs.length; i++) {
      if (orgs[i].organization_id === args.org_id) { target = orgs[i]; break; }
    }
    if (!target) return toolFail("Organization not found. Call without org_id to list available organizations.");
    return toolOk({
      switched_to: {
        organization_id: target.organization_id,
        organization_name: target.organization_name,
        organization_slug: target.organization_slug,
      },
      message: "Use org_id \"" + target.organization_id + "\" in subsequent tool calls.",
    });
  } catch (e) { return toolFail(e.message); }
}

function handlePublishFunction(args) {
  try {
    var auth = getAuth(args);
    var data = apiFetch(auth, "POST", "/api/v1/functions/" + args.function_id + "/publish", { version: args.version });
    return toolOk(data);
  } catch (e) { return toolFail(e.message); }
}

function handleExecuteFunction(args) {
  try {
    var auth = getAuth(args);
    var path = "/api/v1/function/" + args.org_slug + "/" + args.fn_slug + "/execute";
    if (args.version) path += "?version=" + encodeURIComponent(args.version);
    var data = apiFetch(auth, "POST", path, args.payload || {});
    return toolOk(data);
  } catch (e) { return toolFail(e.message); }
}

function handleUpdateFunction(args) {
  try {
    var auth = getAuth(args);
    var body = {
      fnSlug: args.fn_slug,
      orgSlug: args.org_slug,
      function_id: args.function_id,
    };
    if (args.function_name) body.function_name = args.function_name;
    if (args.short_description) body.short_description = args.short_description;
    if (args.category_ids) body.category_ids = args.category_ids;
    if (args.sector_ids) body.sector_ids = args.sector_ids;
    if (args.tag_ids) body.tag_ids = args.tag_ids;
    if (args.long_description) {
      body.long_description = typeof args.long_description === "string"
        ? args.long_description
        : JSON.stringify(args.long_description);
    }
    var data = apiFetch(auth, "PUT", "/api/v1/function/" + args.org_slug + "/" + args.fn_slug + "/details", body);
    return toolOk(data);
  } catch (e) { return toolFail(e.message); }
}

function handleCreateTestEvent(args) {
  try {
    var auth = getAuth(args);
    var body = {
      function_id: args.function_id,
      event_name: args.event_name,
      version: args.version,
    };
    if (args.event_id) body.event_id = args.event_id;
    if (args.event_data) body.event_data = args.event_data;
    var data = apiFetch(auth, "POST", "/api/v1/events", body);
    return toolOk({ success: true, function_id: args.function_id, event_name: args.event_name, version: args.version, response: data });
  } catch (e) { return toolFail(e.message); }
}

function handleCreateTestEventsBulk(args) {
  try {
    var auth = getAuth(args);
    var events = args.events || [];
    if (!events.length) return toolFail("events array is empty.");
    var data = apiFetch(auth, "POST", "/api/v1/events/bulk", { events: events });
    return toolOk({ success: true, events_sent: events.length, response: data });
  } catch (e) { return toolFail(e.message); }
}

// ─── tool dispatch ─────────────────────────────────────────────────────────────

var TOOL_HANDLERS = {
  rival_whoami: handleWhoami,
  rival_list_functions: handleListFunctions,
  rival_get_metadata: handleGetMetadata,
  rival_get_versions: handleGetVersions,
  rival_get_function: handleGetFunction,
  rival_create_function: handleCreateFunction,
  rival_push: handlePush,
  rival_switch_org: handleSwitchOrg,
  rival_publish_function: handlePublishFunction,
  rival_execute_function: handleExecuteFunction,
  rival_update_function: handleUpdateFunction,
  rival_create_test_event: handleCreateTestEvent,
  rival_create_test_events_bulk: handleCreateTestEventsBulk,
};

// ─── MCP protocol handlers ────────────────────────────────────────────────────

function handleInitialize(req) {
  return mcpResult(req.id, {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: { name: "rival-mcp", version: "1.0.0" },
  });
}

function handleListTools(req) {
  return mcpResult(req.id, { tools: TOOLS });
}

function handleCallTool(req) {
  var params = req.params || {};
  var name = params.name;
  var args = params.arguments || {};
  var handler = TOOL_HANDLERS[name];
  if (!handler) return mcpResult(req.id, toolFail("Unknown tool: " + name));
  try {
    return mcpResult(req.id, handler(args));
  } catch (e) {
    return mcpResult(req.id, toolFail(e.message));
  }
}

function handleListResources(req) {
  return mcpResult(req.id, { resources: [] });
}

function handleListPrompts(req) {
  return mcpResult(req.id, { prompts: [] });
}

var MCP_METHODS = {
  "initialize": handleInitialize,
  "tools/list": handleListTools,
  "tools/call": handleCallTool,
  "resources/list": handleListResources,
  "prompts/list": handleListPrompts,
};

// ─── entry point ─────────────────────────────────────────────────────────────

function cortexone_handler(event) {
  var req;
  try {
    req = typeof event === "string" ? JSON.parse(event) : event;
  } catch (_) {
    return mcpError(null, -32700, "Parse error");
  }

  if (!req || req.jsonrpc !== "2.0") {
    return mcpError(req ? req.id : null, -32600, "Invalid Request");
  }

  var handler = MCP_METHODS[req.method];
  if (!handler) return mcpError(req.id, -32601, "Method not found: " + req.method);
  return handler(req);
}
