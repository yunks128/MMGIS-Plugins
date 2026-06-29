const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const Config = require(require("path").join(process.cwd(), "Backend/Config/models/config"));
const AgentConversation = require("../models/agentConversation");
const { planWithProvider, streamWithProvider } = require("../provider");
const { resolveRegion } = require("../regionResolver");
const { normalizeName, scoreCandidate } = require("../utils/text");
const { getClient, haveFasEnv } = require("../azureService");
const AgentTool = require("../models/agentTool");
const { reloadRegistry } = require("../registryManager");

const router = express.Router();

const REPO_ROOT = path.resolve(__dirname, "../../../../");
const DEFAULT_MISSION = process.env.FROZON_DEFAULT_MISSION || "frozon";
const RASTER_STATS_SCRIPT = path.resolve(
  __dirname,
  "../tools/calculate_raster_stats.py",
);
const PYTHON_EXECUTABLE =
  process.env.MMGIS_PYTHON ||
  (process.env.VIRTUAL_ENV
    ? path.join(process.env.VIRTUAL_ENV, "bin", "python")
    : "python3");
const DEMO_QUERIES_CONFIG_PATH = path.resolve(
  __dirname,
  "../../config/copilot_demo_queries.json",
);
const MAX_LAYER_HINTS = 40;
const MAX_LAYER_HINT_ALIASES = 4;
const MAX_LAYER_SUMMARIES = 24;
const MAX_SUMMARY_CHARS = 260;
const MAX_CITATION_CHARS = 180;

function findBestLayerInfo(query, store) {
  if (!store || !Array.isArray(store.index) || store.index.length === 0) {
    return null;
  }
  let best = null;
  let bestScore = 0;
  for (const entry of store.index) {
    const score = scoreCandidate(query, entry.item.name);
    if (score > bestScore) {
      bestScore = score;
      best = entry.item;
    }
  }
  if (!best) return null;
  return { item: best, score: bestScore };
}

function sanitizeLayerHints(rawLayers) {
  if (!Array.isArray(rawLayers)) return [];
  const unique = new Map();
  for (const raw of rawLayers.slice(0, MAX_LAYER_HINTS)) {
    if (!raw || typeof raw !== "object") continue;
    const display =
      typeof raw.display_name === "string"
        ? raw.display_name.trim()
        : typeof raw.displayName === "string"
          ? raw.displayName.trim()
          : typeof raw.name === "string"
            ? raw.name.trim()
            : "";
    if (!display) continue;
    const canonical =
      typeof raw.canonical_name === "string"
        ? raw.canonical_name.trim()
        : typeof raw.canonicalName === "string"
          ? raw.canonicalName.trim()
          : "";
    const aliasSource =
      Array.isArray(raw.aliases) && raw.aliases.length
        ? raw.aliases
        : Array.isArray(raw.alias)
          ? raw.alias
          : [];
    const aliases = Array.from(
      new Set(
        aliasSource
          .map((value) =>
            typeof value === "string" ? value.trim() : String(value || ""),
          )
          .filter((value) => value.length > 0),
      ),
    ).slice(0, MAX_LAYER_HINT_ALIASES);
    const visible =
      typeof raw.visible === "boolean"
        ? raw.visible
        : typeof raw.isVisible === "boolean"
          ? raw.isVisible
          : undefined;
    const bboxArray =
      Array.isArray(raw.bbox) && raw.bbox.length === 4
        ? raw.bbox.map((value) => Number(value))
        : null;
    const normalizedBbox =
      bboxArray && bboxArray.every((value) => Number.isFinite(value))
        ? bboxArray
        : undefined;
    const key = display.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, {
        displayName: display,
        canonicalName: canonical || null,
        aliases,
        visible,
        bbox: normalizedBbox,
      });
    }
  }
  return Array.from(unique.values());
}

function truncateText(value, maxChars) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}\u2026`;
}

function selectLayerSummaries(store) {
  if (!store || !Array.isArray(store.items)) return [];
  return store.items.slice(0, MAX_LAYER_SUMMARIES).map((item) => ({
    name: item.name,
    summary: truncateText(item.summary, MAX_SUMMARY_CHARS),
    citation: truncateText(item.citation, MAX_CITATION_CHARS),
  }));
}

const layerCatalogCache = new Map();

function getLayerSearchRoots(mission) {
  const missionName = mission || DEFAULT_MISSION;
  return [
    path.join(REPO_ROOT, "Missions", missionName),
    path.join(REPO_ROOT, "Missions"),
    REPO_ROOT,
  ];
}

async function loadMissionConfig(mission) {
  const missionName = mission || DEFAULT_MISSION;

  // Honour FORCE_CONFIG_PATH (same env var the main config endpoint uses)
  if (process.env.FORCE_CONFIG_PATH) {
    try {
      const raw = fs.readFileSync(process.env.FORCE_CONFIG_PATH, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("FORCE_CONFIG_PATH load failed:", e?.message);
    }
  }

  try {
    const record = await Config.findOne({
      where: { mission: missionName },
      order: [["id", "DESC"]],
    });
    if (record && record.config) return record.config;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to fetch mission config for ${missionName}:`, error?.message);
  }
  // Fallback: attempt to read a config JSON from Missions directory
  try {
    // Prefer explicit unversioned mission file if present.
    const preferred = path.join(REPO_ROOT, "Missions", `${missionName}_config.json`);
    if (fs.existsSync(preferred)) {
      const raw = fs.readFileSync(preferred, "utf8");
      return JSON.parse(raw);
    }
    // Otherwise, scan Missions for mission-specific config files and pick newest.
    const missionsDir = path.join(REPO_ROOT, "Missions");
    const extractVersion = (filename) => {
      const match = String(filename || "").match(/_v(\d+)_config\.json$/i);
      if (!match) return -1;
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : -1;
    };
    const candidates = fs
      .readdirSync(missionsDir)
      .filter((f) => /config\.json$/i.test(f) && f.toLowerCase().includes(missionName.toLowerCase()))
      .map((f) => ({
        file: path.join(missionsDir, f),
        version: extractVersion(f),
        mtime: fs.statSync(path.join(missionsDir, f)).mtimeMs,
      }))
      .sort((a, b) => {
        if (b.version !== a.version) return b.version - a.version;
        return b.mtime - a.mtime;
      });
    if (candidates.length) {
      const raw = fs.readFileSync(candidates[0].file, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`Config file fallback failed for ${missionName}:`, e?.message);
  }
  return null;
}

async function buildLayerCatalog(mission) {
  const missionName = mission || DEFAULT_MISSION;
  const cached = layerCatalogCache.get(missionName);
  if (cached) return cached;
  let catalog = [];
  try {
    const config = await loadMissionConfig(missionName);
    if (!config) {
      throw new Error("Mission config not found");
    }
    const layers = Array.isArray(config.layers) ? config.layers : [];
    const entries = [];

    const collectAliasesFromSource = (source) => {
      const aliases = [];
      if (!source || typeof source !== "string") return aliases;
      const normalized = source.replace(/\\/g, "/");
      aliases.push(normalized);
      const parts = normalized.split("/");
      const file = parts[parts.length - 1];
      if (file) {
        aliases.push(file);
        const withoutExt = file.replace(/\.[^.]+$/, "");
        if (withoutExt && withoutExt !== file) aliases.push(withoutExt);
        aliases.push(file.replace(/[_-]+/g, " "));
        aliases.push(withoutExt.replace(/[_-]+/g, " "));
      }
      return aliases;
    };

    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      const name =
        typeof node.name === "string" && node.name.trim()
          ? node.name.trim()
          : null;
      if (name) {
        const sources = [];
        ["url", "path", "source", "cogUrl", "href"].forEach((key) => {
          if (typeof node[key] === "string" && node[key].trim()) {
            sources.push(node[key].trim());
          }
        });
        const aliases = new Set([name]);
        sources.forEach((src) => {
          collectAliasesFromSource(src).forEach((alias) => aliases.add(alias));
        });
        entries.push({
          name,
          sources,
          aliases: Array.from(aliases),
          sourceType: node.sourceType || null,
        });
      }
      if (Array.isArray(node.sublayers)) {
        node.sublayers.forEach(visit);
      }
    };

    layers.forEach(visit);
    catalog = entries;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to load layer config for mission ${missionName}:`, error?.message);
    catalog = [];
  }
  layerCatalogCache.set(missionName, catalog);
  return catalog;
}

function resolveRasterPathFromSources(sources = [], mission) {
  const layerSearchRoots = getLayerSearchRoots(mission);
  const RASTER_EXT = /\.tif[f]?$/i;

  for (const source of sources) {
    if (!source || typeof source !== "string") continue;
    // Skip external URLs — they have no local file.
    if (/^https?:\/\//i.test(source)) continue;

    const hasTimeToken = /\{(time|starttime|endtime)\}/i.test(source);

    if (!hasTimeToken) {
      // Exact path resolution
      if (path.isAbsolute(source) && fs.existsSync(source) && RASTER_EXT.test(source)) return source;
      const normalized = source.replace(/^\.?[\\/]/, "");
      for (const root of layerSearchRoots) {
        const candidate = path.resolve(root, normalized);
        if (fs.existsSync(candidate) && RASTER_EXT.test(candidate)) return candidate;
      }
    } else {
      // Source contains time tokens (e.g. "Layers/dir/file_{time}.tif").
      // Turn the token into a wildcard and pick the most recent matching file.
      const globbed = source
        .replace(/\{(time|starttime|endtime)\}/gi, "*")
        .replace(/^\.?[\\/]/, "");
      for (const root of layerSearchRoots) {
        const dir = path.resolve(root, path.dirname(globbed));
        if (!fs.existsSync(dir)) continue;
        const pattern = path.basename(globbed);
        const re = new RegExp(
          "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$",
          "i"
        );
        let entries;
        try { entries = fs.readdirSync(dir); } catch { continue; }
        const matches = entries
          .filter((f) => re.test(f) && RASTER_EXT.test(f))
          .sort()
          .reverse(); // newest time first (lexicographic)
        if (matches.length) {
          return path.join(dir, matches[0]);
        }
      }
    }
  }
  return null;
}

function searchRasterByName(layerName, mission) {
  const target = normalizeName(layerName);
  let best = { path: null, score: 0 };
  const layerSearchRoots = getLayerSearchRoots(mission);

  const visitDir = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visitDir(fullPath);
        continue;
      }
      if (!/\.tif[f]?$/i.test(entry.name)) continue;
      const base = entry.name.replace(/\.[^.]+$/, "");
      const score = scoreCandidate(layerName, base);
      if (score > best.score) {
        best = { path: fullPath, score };
      }
    }
  };

  for (const root of layerSearchRoots) {
    const layersDir = path.join(root, "Layers");
    visitDir(layersDir);
  }
  return best.path ? best : null;
}

function loadDemoQueries() {
  let raw;
  try {
    raw = fs.readFileSync(DEMO_QUERIES_CONFIG_PATH, "utf8");
  } catch (error) {
    const err = new Error(
      `Failed to read demo queries config at ${DEMO_QUERIES_CONFIG_PATH}: ${error.message}`,
    );
    err.status = 500;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const err = new Error(
      `Invalid JSON in demo queries config at ${DEMO_QUERIES_CONFIG_PATH}: ${error.message}`,
    );
    err.status = 500;
    throw err;
  }

  const sourceQueries = parsed?.queries;
  if (!Array.isArray(sourceQueries)) {
    const err = new Error(
      `Demo queries config must include a 'queries' array at ${DEMO_QUERIES_CONFIG_PATH}.`,
    );
    err.status = 500;
    throw err;
  }

  const queries = sourceQueries
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  if (!queries.length) {
    const err = new Error(
      `Demo queries config contains no valid query strings at ${DEMO_QUERIES_CONFIG_PATH}.`,
    );
    err.status = 500;
    throw err;
  }

  return queries;
}

function scoreCatalog(catalog, targetNorm) {
  const scored = [];
  for (const entry of catalog) {
    const aliasList = Array.isArray(entry.aliases)
      ? entry.aliases
      : [entry.name];
    let entryBest = 0;
    for (const alias of aliasList) {
      const score = scoreCandidate(targetNorm, alias);
      if (score > entryBest) entryBest = score;
    }
    if (entryBest > 0) scored.push({ entry, score: entryBest });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function findLayerRaster(layerName, mission) {
  const catalog = await buildLayerCatalog(mission);
  const targetNorm = normalizeName(layerName);
  const scored = scoreCatalog(catalog, targetNorm);

  // If the best catalog match is an external layer (HTTPS source, no local file),
  // return null immediately — the endpoint will surface a 422 explaining why.
  // This prevents falling through to unrelated local layers.
  const topEntry = scored.length ? scored[0].entry : null;
  if (topEntry) {
    const topSources = topEntry.sources || [];
    const isTopExternal =
      topEntry.sourceType === 'url' ||
      topSources.some((s) => /^https?:\/\//i.test(s));
    const isTopGroup = topSources.length === 0;
    if (isTopExternal) return null;

    // Try each match in score order until we find one with a resolvable path.
    // Only consider entries whose score is within a reasonable range of the best.
    const topScore = scored[0].score;
    const MIN_SCORE_RATIO = isTopGroup ? 0.5 : 0.6;
    for (const { entry, score } of scored) {
      if (topScore > 0 && score / topScore < MIN_SCORE_RATIO) break;
      const resolved = resolveRasterPathFromSources(entry.sources, mission);
      if (resolved) {
        return { name: entry.name, path: resolved, score };
      }
    }
  }

  // Filesystem fallback for layers not in the catalog.
  const fallback = searchRasterByName(layerName, mission);
  if (fallback && fallback.score >= 0.4) {
    return {
      name: layerName,
      path: fallback.path,
      score: fallback.score,
    };
  }
  return null;
}

function getMissionFromRequest(req) {
  const mission =
    typeof req.query?.mission === "string" && req.query.mission.trim()
      ? req.query.mission.trim()
      : null;
  return mission || DEFAULT_MISSION;
}

function getLiveToolOptions(req) {
  const registry = req.app?.locals?.agentToolRegistry;
  const toolNames = req.app?.locals?.agentToolNames;
  return { registry, toolNames };
}

function parseBboxFromQuery(query) {
  const keys = ["lon_min", "lat_min", "lon_max", "lat_max"];
  if (keys.every((key) => query[key] != null)) {
    const values = keys.map((key) => Number(query[key]));
    if (
      values.every((value) => Number.isFinite(value)) &&
      values[0] < values[2] &&
      values[1] < values[3]
    ) {
      return values;
    }
  }
  if (typeof query.b === "string") {
    const parts = query.b
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value));
    if (
      parts.length === 4 &&
      parts[0] < parts[2] &&
      parts[1] < parts[3]
    ) {
      return parts;
    }
  }
  return null;
}

function runRasterStats(rasterPath, bbox, options = {}) {
  return new Promise((resolve, reject) => {
    const mode = options.mode || "full";
    const args = [RASTER_STATS_SCRIPT, rasterPath, "--mode", mode];
    if (bbox) {
      args.push("--bbox", ...bbox.map((value) => String(value)));
    }
    if (mode === "tiled" && typeof options.tileSize === "number") {
      args.push("--tile-size", String(options.tileSize));
    }
    if (mode === "sampled" && typeof options.sampleSpacing === "number") {
      args.push("--sample-spacing", String(options.sampleSpacing));
    }

    const child = spawn(PYTHON_EXECUTABLE, args, { cwd: REPO_ROOT });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(
          stderr.trim() ||
            `Raster stats script failed with exit code ${code}`,
        );
        err.code = code;
        err.stderr = stderr;
        return reject(err);
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        resolve(parsed);
      } catch (error) {
        const err = new Error(`Failed to parse raster stats output: ${error.message}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

function getToolNames(req) {
  return req.app?.locals?.agentToolNames || new Set();
}

function getValidators(req) {
  return req.app?.locals?.agentToolValidators || {};
}

function repr(v) {
  try {
    if (typeof v === "string") return `"${v}"`;
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function validateAction(action, req) {
  if (!action || typeof action !== "object") {
    throw new TypeError(
      `Action must be an object; received ${repr(action)} instead`,
    );
  }
  const toolNames = getToolNames(req);
  if (!toolNames.has(action.tool)) {
    const expected = [...toolNames].join(", ") || "(none)";
    throw new Error(
      `Unknown tool '${action.tool}'. Expected one of ${expected}; received ${repr(action.tool)} instead`,
    );
  }
  const validators = getValidators(req);
  const validate = validators[action.tool];
  const args = action.args || {};
  if (typeof validate !== "function") {
    throw new Error(`No validator for tool ${action.tool}`);
  }
  const valid = validate(args);
  if (!valid) {
    const errors =
      (validate.errors || [])
        .map((e) => `${e.instancePath || ""} ${e.message}`)
        .join("; ") || "validation failed";
    const err = new Error(`${action.tool} args invalid: ${errors}`);
    err.validationErrors = validate.errors || [];
    throw err;
  }
  return { tool: action.tool, args };
}

router.post("/", express.json(), async function (req, res) {
  try {
    const message = req.body?.message ?? "";
    if (typeof message !== "string") {
      const err = new Error("Message must be a string.");
      err.status = 400;
      throw err;
    }
    if (message.length > 2000) {
      const err = new Error("Message too long (max 2000 chars).");
      err.status = 400;
      throw err;
    }

    const mission = getMissionFromRequest(req);
    const bodyContext = req.body?.context || {};
    const clientLayerHints = sanitizeLayerHints(bodyContext.layers);
    const layerInfoStore = req.app?.locals?.agentLayerInfo;
    const layerSummaries = selectLayerSummaries(layerInfoStore);

    // Conversation persistence
    let conversationId = req.body?.conversationId || null;
    let conversation = null;
    let azureThreadId = null;

    if (conversationId) {
      try {
        conversation = await AgentConversation.findByPk(conversationId);
        if (conversation) {
          azureThreadId = conversation.azureThreadId;
        }
      } catch (_) {
        // If lookup fails, proceed without conversation
      }
    }

    if (!conversation) {
      conversationId = uuidv4();
      conversation = await AgentConversation.create({
        conversationId,
        missionName: mission,
        title: message.slice(0, 200),
        messages: [],
      });
    }

    const result = await planWithProvider(message, {
      layerHints: clientLayerHints,
      layerSummaries,
    }, { threadId: azureThreadId, ...getLiveToolOptions(req) });
    if (!result || !Array.isArray(result.actions)) {
      throw new Error(
        "Provider returned malformed response (missing actions array).",
      );
    }

    const reply = typeof result.reply === "string" ? result.reply.trim() : "";
    const citations = Array.isArray(result.citations) ? result.citations : [];
    const actions = result.actions.map((action) => validateAction(action, req));

    const planList = actions.map((a) => a.tool).join(", ") || "(none)";
    const planText = `Planned: ${planList}.`;

    const segments = [];
    if (reply) segments.push(reply);
    if (planText) segments.push(planText);
    const text = segments.join("\n\n");

    const debug = {
      providerAttempted: true,
      providerReturnedActions: actions.length > 0,
      providerFailureReason: null,
    };
    if (result.debug) {
      debug.azure = result.debug;
    }

    // Persist messages to conversation
    try {
      const updatedMessages = [
        ...(conversation.messages || []),
        { role: "user", text: message, timestamp: new Date().toISOString() },
        { role: "assistant", text: reply, actions, citations, timestamp: new Date().toISOString() },
      ];
      await conversation.update({
        messages: updatedMessages,
        azureThreadId: result.threadId || azureThreadId,
      });
    } catch (_) {
      // Non-fatal: response still goes through even if persistence fails
    }

    res.status(200).json({
      text,
      reply,
      citations,
      actions,
      conversationId,
      source: "provider",
      debug,
    });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    try {
      // eslint-disable-next-line no-console
      console.error("Agent planning error:", error);
    } catch (_) {}
    const response = {
      error: error.message || "Agent planning failed",
    };
    if (error.debug) response.debug = error.debug;
    if (error.validationErrors)
      response.validationErrors = error.validationErrors;
    res.status(status).json(response);
  }
});

router.post("/stream", express.json(), async function (req, res) {
  try {
    const message = req.body?.message ?? "";
    if (typeof message !== "string") {
      return res.status(400).json({ error: "Message must be a string." });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Message too long (max 2000 chars)." });
    }

    const mission = getMissionFromRequest(req);
    const bodyContext = req.body?.context || {};
    const clientLayerHints = sanitizeLayerHints(bodyContext.layers);
    const layerInfoStore = req.app?.locals?.agentLayerInfo;
    const layerSummaries = selectLayerSummaries(layerInfoStore);

    // Conversation persistence
    let conversationId = req.body?.conversationId || null;
    let conversation = null;
    let azureThreadId = null;

    if (conversationId) {
      try {
        conversation = await AgentConversation.findByPk(conversationId);
        if (conversation) azureThreadId = conversation.azureThreadId;
      } catch (_) {}
    }

    if (!conversation) {
      conversationId = uuidv4();
      conversation = await AgentConversation.create({
        conversationId,
        missionName: mission,
        title: message.slice(0, 200),
        messages: [],
      });
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send conversationId immediately
    res.write(`data: ${JSON.stringify({ type: "conversationId", data: conversationId })}\n\n`);

    let lastPlan = null;

    for await (const event of streamWithProvider(
      message,
      { layerHints: clientLayerHints, layerSummaries },
      { threadId: azureThreadId, ...getLiveToolOptions(req) },
    )) {
      if (event.type === "plan") {
        lastPlan = event.data;
        // Validate actions before sending
        const validatedActions = [];
        for (const action of event.data.actions || []) {
          try {
            validatedActions.push(validateAction(action, req));
          } catch (_) {}
        }
        res.write(`data: ${JSON.stringify({
          type: "plan",
          data: { ...event.data, actions: validatedActions },
        })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    }

    // Persist conversation after stream completes
    try {
      const reply = lastPlan?.reply || "";
      const actions = lastPlan?.actions || [];
      const citations = lastPlan?.citations || [];
      const newThreadId = lastPlan?.threadId || azureThreadId;
      const updatedMessages = [
        ...(conversation.messages || []),
        { role: "user", text: message, timestamp: new Date().toISOString() },
        { role: "assistant", text: reply, actions, citations, timestamp: new Date().toISOString() },
      ];
      await conversation.update({
        messages: updatedMessages,
        azureThreadId: newThreadId,
      });
    } catch (_) {}

    res.end();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Agent stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Agent streaming failed" });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", data: error.message || "Streaming failed" })}\n\n`);
      res.end();
    }
  }
});

router.get("/layer-info", (req, res) => {
  const store = req.app?.locals?.agentLayerInfo;
  if (!store || store.error) {
    res.status(404).json({
      error: "Layer metadata is unavailable.",
      code: "LayerInfoUnavailable",
      details: store?.error || null,
    });
    return;
  }

  const query =
    typeof req.query?.name === "string" ? req.query.name.trim() : "";
  let items = store.items || [];
  let match = null;
  if (query) {
    const found = findBestLayerInfo(query, store);
    if (found && found.score >= 0.35) {
      items = [found.item];
      match = {
        name: found.item.name,
        score: Number(found.score.toFixed(3)),
      };
    } else {
      items = [];
      match = null;
    }
  }

  res.status(200).json({
    items,
    match,
    source: {
      path: store.sourcePath || null,
      loadedAt: store.loadedAt || null,
    },
  });
});

router.get("/copilot/demo-queries", (req, res) => {
  try {
    const queries = loadDemoQueries();
    res.status(200).json({ queries });
  } catch (error) {
    res.status(500).json({
      error: error?.message || "Failed to load copilot demo queries.",
    });
  }
});

router.get("/regions/resolve", async (req, res) => {
  try {
    const nameParam =
      (typeof req.query.name === "string" && req.query.name.trim()) ||
      (typeof req.query.q === "string" && req.query.q.trim()) ||
      "";
    if (!nameParam) {
      res.status(400).json({ error: "Query parameter 'name' is required." });
      return;
    }
    const bufferParam =
      typeof req.query.buffer_km === "string" && req.query.buffer_km.trim()
        ? Number(req.query.buffer_km)
        : null;
    const bufferKm =
      Number.isFinite(bufferParam) && bufferParam > 0 ? bufferParam : null;

    const resolved = await resolveRegion(nameParam, { bufferKm });
    if (!resolved) {
      res.status(404).json({
        error: `Unable to resolve geographical area '${nameParam}'.`,
      });
      return;
    }
    res.status(200).json({
      label: resolved.label,
      bbox: resolved.bbox,
      bboxParts: resolved.bboxParts,
      geometry: resolved.geometry || null,
      geometry_type: resolved.geometryType || (resolved.geometry ? "polygon" : "bbox"),
      source: resolved.sourceDomain || null,
      source_domain: resolved.sourceDomain || null,
      source_url: resolved.sourceUrl || null,
      method: resolved.method || "bbox",
      buffer_km: resolved.bufferKm || null,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("regions/resolve error:", error);
    res.status(500).json({
      error: error?.message || "Failed to resolve geographical region.",
    });
  }
});

router.get("/analytics/statistics", async (req, res) => {
  try {
    const mission = getMissionFromRequest(req);
    const layerName =
      typeof req.query.layer_name === "string" && req.query.layer_name.trim()
        ? req.query.layer_name.trim()
        : typeof req.query.layer === "string" && req.query.layer.trim()
          ? req.query.layer.trim()
          : null;
    if (!layerName) {
      res.status(400).json({
        error: "Query parameter 'layer_name' is required.",
      });
      return;
    }

    const bbox = parseBboxFromQuery(req.query);
    const layerRecord = await findLayerRaster(layerName, mission);
    if (!layerRecord || !layerRecord.path) {
      // Check if the layer exists but is an external tile service
      const catalog = await buildLayerCatalog(mission);
      const scored = scoreCatalog(catalog, normalizeName(layerName));
      const catalogMatch = scored.length ? scored[0].entry : null;
      const isExternal = catalogMatch && (
        catalogMatch.sourceType === 'url' ||
        (catalogMatch.sources || []).some((s) => /^https?:\/\//i.test(s))
      );
      if (isExternal) {
        res.status(422).json({
          error: `Layer '${catalogMatch.name}' is an external tile service and does not have local raster data for statistics.`,
          layer_name: catalogMatch.name,
          sourceType: catalogMatch.sourceType || 'url',
        });
        return;
      }
      res.status(404).json({
        error: `Unable to locate raster data for layer '${layerName}'.`,
      });
      return;
    }

    let stats = null;
    const attempts = [
      { mode: "full" },
      { mode: "tiled", tileSize: 1024 },
      { mode: "sampled", sampleSpacing: 1.0 },
    ];
    const errors = [];
    for (const attempt of attempts) {
      try {
        stats = await runRasterStats(layerRecord.path, bbox, attempt);
        break;
      } catch (error) {
        errors.push({ mode: attempt.mode, error });
      }
    }
    if (!stats) {
      const last = errors[errors.length - 1];
      const err = new Error(
        last?.error?.message || "Failed to compute raster statistics.",
      );
      err.cause = last?.error;
      throw err;
    }
    const response = {
      layer_name: layerRecord.name,
      layer_path: stats.path || layerRecord.path,
      source: "local-raster",
      confidence: layerRecord.score,
      mean: typeof stats.mean === "number" ? stats.mean : null,
      std: typeof stats.std === "number" ? stats.std : null,
      min: typeof stats.min === "number" ? stats.min : null,
      max: typeof stats.max === "number" ? stats.max : null,
      median:
        typeof stats.median === "number"
          ? stats.median
          : typeof stats.q50 === "number"
            ? stats.q50
            : null,
      q25: typeof stats.q25 === "number" ? stats.q25 : null,
      q75: typeof stats.q75 === "number" ? stats.q75 : null,
      valid_count: typeof stats.count === "number" ? stats.count : null,
      total_count: typeof stats.count === "number" ? stats.count : null,
      count: typeof stats.count === "number" ? stats.count : null,
      is_sampled: (stats.method || "").toLowerCase() === "sampled",
      method: stats.method || "full",
      valid_count: typeof stats.valid_count === "number" ? stats.valid_count : null,
      nodata_count: typeof stats.nodata_count === "number" ? stats.nodata_count : null,
      quantiles:
        typeof stats.q25 === "number" || typeof stats.q75 === "number"
          ? {
              "0.25": stats.q25 ?? null,
              "0.50":
                typeof stats.median === "number"
                  ? stats.median
                  : typeof stats.q50 === "number"
                    ? stats.q50
                    : null,
              "0.75": stats.q75 ?? null,
            }
          : null,
      bbox: bbox
        ? {
            lon_min: bbox[0],
            lat_min: bbox[1],
            lon_max: bbox[2],
            lat_max: bbox[3],
          }
        : null,
    };
    res.status(200).json(response);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("analytics/statistics error:", error);
    res.status(500).json({
      error: error?.message || "Failed to compute raster statistics.",
    });
  }
});

router.get("/analytics/layers", async (req, res) => {
  try {
    const mission = getMissionFromRequest(req);
    const catalog = await buildLayerCatalog(mission);
    const payload = catalog.map((entry) => ({
      name: entry.name,
      aliases: entry.aliases || [],
      sources: entry.sources || [],
    }));
    res.status(200).json({ layers: payload, mission });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("analytics/layers error:", error);
    res.status(500).json({
      error: error?.message || "Failed to enumerate analytics layers.",
    });
  }
});

router.get("/analytics/resolve-cog", async (req, res) => {
  try {
    const mission = getMissionFromRequest(req);
    const layerName =
      typeof req.query.layer_name === "string" && req.query.layer_name.trim()
        ? req.query.layer_name.trim()
        : typeof req.query.layer === "string" && req.query.layer.trim()
          ? req.query.layer.trim()
          : null;
    if (!layerName) {
      res.status(400).json({ error: "Query parameter 'layer_name' is required." });
      return;
    }

    let layerRecord = await findLayerRaster(layerName, mission);

    // If standard resolution fails, try STAC collection directories
    if (!layerRecord || !layerRecord.path) {
      // Check if layerName is a STAC collection name directly (e.g. "forecast-7day-PRED")
      const layerSearchRoots = getLayerSearchRoots(mission);
      for (const root of layerSearchRoots) {
        const dir = path.join(root, "Layers", layerName);
        if (fs.existsSync(dir)) {
          try {
            const entries = fs.readdirSync(dir);
            const tiffs = entries.filter((f) => /\.tif[f]?$/i.test(f)).sort();
            if (tiffs.length > 0) {
              layerRecord = { name: layerName, path: path.join(dir, tiffs[tiffs.length - 1]), score: 1.0 };
              break;
            }
          } catch (_) {}
        }
      }
    }

    // Also try matching via mission config STAC collection URLs
    if (!layerRecord || !layerRecord.path) {
      try {
        const config = await loadMissionConfig(mission);
        if (config) {
          const layers = Array.isArray(config.layers) ? config.layers : [];
          let stacUrl = null;
          let bestScore = 0;
          const visit = (node) => {
            if (!node || typeof node !== "object") return;
            const name = (node.name || "").trim();
            if (name && node.sourceType === "stac-collection" && node.url) {
              const score = scoreCandidate(layerName, name);
              if (score > bestScore) { bestScore = score; stacUrl = node.url; }
            }
            if (Array.isArray(node.sublayers)) node.sublayers.forEach(visit);
          };
          layers.forEach(visit);
          if (stacUrl) {
            const layerSearchRoots = getLayerSearchRoots(mission);
            for (const root of layerSearchRoots) {
              const dir = path.join(root, "Layers", stacUrl);
              if (!fs.existsSync(dir)) continue;
              try {
                const entries = fs.readdirSync(dir);
                const tiffs = entries.filter((f) => /\.tif[f]?$/i.test(f)).sort();
                if (tiffs.length > 0) {
                  layerRecord = { name: layerName, path: path.join(dir, tiffs[tiffs.length - 1]), score: bestScore };
                  break;
                }
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
    }

    if (!layerRecord || !layerRecord.path) {
      const catalog = await buildLayerCatalog(mission);
      const catalogMatch = catalog.find(
        (e) => e.name.toLowerCase().includes(layerName.toLowerCase())
      );
      if (catalogMatch && catalogMatch.sourceType === 'url') {
        res.status(422).json({
          error: `Layer '${catalogMatch.name}' is an external tile service and does not have local raster data for statistics.`,
          layer_name: catalogMatch.name,
          sourceType: catalogMatch.sourceType,
        });
        return;
      }
      res.status(404).json({
        error: `Unable to locate raster data for layer '${layerName}'.`,
      });
      return;
    }

    // Map server filesystem path -> titiler mount (/Missions)
    let p = String(layerRecord.path).replace(/\\/g, "/");
    const idx = p.indexOf("/Missions/");
    let titilerUrl = null;
    if (idx >= 0) {
      titilerUrl = p.slice(idx);
    } else {
      // Best-effort
      if (p.includes("Missions/")) titilerUrl = "/" + p.slice(p.indexOf("Missions/"));
      else titilerUrl = "/Missions/" + p.replace(/^.*?Missions\/?/, "");
    }

    res.status(200).json({
      url: titilerUrl,
      path: layerRecord.path,
      mission,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("analytics/resolve-cog error:", error);
    res.status(500).json({ error: error?.message || "Failed to resolve COG url." });
  }
});

// --- Layer difference endpoint ---

router.get("/analytics/difference", async (req, res) => {
  try {
    const mission = getMissionFromRequest(req);
    const layerNameA = (req.query.layer_a || "").trim();
    const layerNameB = (req.query.layer_b || "").trim();
    if (!layerNameA || !layerNameB) {
      return res.status(400).json({ error: "Both layer_a and layer_b are required." });
    }

    // Try to resolve rasters — first via catalog, then by finding a tiff in
    // the layer's STAC collection directory
    const requestedTime = (req.query.time || "").trim();

    async function resolveRaster(layerName) {
      // Try STAC collection resolution first (more precise for named layers)
      // then fall back to standard resolution
      // the STAC collection URL, then pick the most recent tiff in that directory
      const config = await loadMissionConfig(mission);
      if (!config) return null;

      const layers = Array.isArray(config.layers) ? config.layers : [];
      let stacUrl = null;
      let bestMatchScore = 0;

      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        const name = (node.name || "").trim();
        if (name && node.sourceType === "stac-collection" && node.url) {
          const score = scoreCandidate(layerName, name);
          if (score > bestMatchScore) {
            bestMatchScore = score;
            stacUrl = node.url;
          }
        }
        if (Array.isArray(node.sublayers)) node.sublayers.forEach(visit);
      };
      layers.forEach(visit);

      if (!stacUrl) {
        // Fall back to standard resolution
        const record = await findLayerRaster(layerName, mission);
        if (record?.path) return record;
        return null;
      }

      // stacUrl is the collection name, e.g. "forecast-7day-PRED"
      // Look for tiff files in Missions/{mission}/Layers/{stacUrl}/
      const layerSearchRoots = getLayerSearchRoots(mission);
      for (const root of layerSearchRoots) {
        const dir = path.join(root, "Layers", stacUrl);
        if (!fs.existsSync(dir)) continue;
        let entries;
        try { entries = fs.readdirSync(dir); } catch { continue; }
        const tiffs = entries
          .filter((f) => /\.tif[f]?$/i.test(f))
          .sort();
        if (tiffs.length > 0) {
          let selected = tiffs[tiffs.length - 1]; // default: newest
          // If a time was requested, find the tiff closest to that date
          if (requestedTime) {
            const target = requestedTime.replace(/[-T:Z]/g, "").slice(0, 8); // "20240110"
            let bestDist = Infinity;
            for (const f of tiffs) {
              const dateMatch = f.match(/(\d{8})/);
              if (dateMatch) {
                const dist = Math.abs(Number(dateMatch[1]) - Number(target));
                if (dist < bestDist) {
                  bestDist = dist;
                  selected = f;
                }
              }
            }
          }
          return { name: layerName, path: path.join(dir, selected), score: 1.0 };
        }
      }
      return null;
    }

    const recordA = await resolveRaster(layerNameA);
    const recordB = await resolveRaster(layerNameB);
    if (!recordA?.path) {
      return res.status(404).json({ error: `Cannot find raster for layer '${layerNameA}'.` });
    }
    if (!recordB?.path) {
      return res.status(404).json({ error: `Cannot find raster for layer '${layerNameB}'.` });
    }

    const bbox = parseBboxFromQuery(req.query);

    // Compute difference using Python
    const result = await new Promise((resolve, reject) => {
      const args = [
        "-c",
        `
import sys, json, numpy as np
try:
    import rasterio
    from rasterio.warp import reproject, Resampling, calculate_default_transform
except ImportError:
    print(json.dumps({"error": "rasterio not installed"}))
    sys.exit(0)

path_a = sys.argv[1]
path_b = sys.argv[2]
bbox_str = sys.argv[3] if len(sys.argv) > 3 else ""

with rasterio.open(path_a) as src_a, rasterio.open(path_b) as src_b:
    # Read data
    data_a = src_a.read(1).astype(np.float64)
    data_b = src_b.read(1).astype(np.float64)

    nodata_a = src_a.nodata
    nodata_b = src_b.nodata

    # Create masks — filter out nodata fill values
    # For SIC data, valid range is 0-1; for other data, filter extreme negatives
    def make_valid_mask(data, nodata):
        mask = np.isfinite(data)
        if nodata is not None:
            mask = mask & (data != nodata)
        # Auto-detect fill value: if many pixels are exactly -9999, use that
        if np.sum(data == -9999) > data.size * 0.1:
            mask = mask & (data != -9999)
        # If data range suggests 0-1 (SIC), filter negatives
        if np.max(data[mask]) <= 1.5:
            mask = mask & (data >= 0)
        else:
            mask = mask & (data > -9000)
        return mask
    mask_a = make_valid_mask(data_a, nodata_a)
    mask_b = make_valid_mask(data_b, nodata_b)
    if nodata_a is not None:
        mask_a = mask_a & (data_a != nodata_a)
    if nodata_b is not None:
        mask_b = mask_b & (data_b != nodata_b)

    # Ensure same shape
    if data_a.shape != data_b.shape:
        # Resample B to match A
        from rasterio.warp import reproject, Resampling
        data_b_resampled = np.empty_like(data_a)
        reproject(
            data_b, data_b_resampled,
            src_transform=src_b.transform, src_crs=src_b.crs,
            dst_transform=src_a.transform, dst_crs=src_a.crs,
            resampling=Resampling.nearest
        )
        data_b = data_b_resampled
        mask_b = make_valid_mask(data_b, nodata_b)

    valid = mask_a & mask_b
    diff = np.where(valid, data_a - data_b, np.nan)
    valid_diff = diff[valid]

    if len(valid_diff) == 0:
        print(json.dumps({"error": "No overlapping valid pixels"}))
        sys.exit(0)

    result = {
        "mean": float(np.nanmean(valid_diff)),
        "std": float(np.nanstd(valid_diff)),
        "min": float(np.nanmin(valid_diff)),
        "max": float(np.nanmax(valid_diff)),
        "median": float(np.nanmedian(valid_diff)),
        "q25": float(np.nanpercentile(valid_diff, 25)),
        "q75": float(np.nanpercentile(valid_diff, 75)),
        "valid_count": int(np.sum(valid)),
        "total_count": int(data_a.size),
        "mean_a": float(np.nanmean(data_a[mask_a])),
        "mean_b": float(np.nanmean(data_b[mask_b])),
        "layer_a": "${layerNameA.replace(/"/g, '')}",
        "layer_b": "${layerNameB.replace(/"/g, '')}",
        "path_a": path_a,
        "path_b": path_b,
    }
    print(json.dumps(result))
`,
        recordA.path,
        recordB.path,
      ];
      if (bbox) args.push(bbox.join(","));

      const child = spawn(PYTHON_EXECUTABLE, args, { cwd: REPO_ROOT });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(stderr.trim() || `Difference script failed (exit ${code})`));
        }
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (e) {
          reject(new Error(`Failed to parse difference output: ${e.message}`));
        }
      });
    });

    if (result.error) {
      return res.status(422).json({ error: result.error });
    }

    res.status(200).json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("analytics/difference error:", error);
    res.status(500).json({ error: error?.message || "Failed to compute layer difference." });
  }
});

// --- Tool management endpoints ---

router.post("/tools/register", express.json(), async (req, res) => {
  try {
    const { name, description, execution, modelParameters, parameters } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Tool name is required." });
    }
    const [tool, created] = await AgentTool.upsert({
      name: name.trim(),
      description: description || "",
      execution: execution || {},
      modelParameters: modelParameters || {},
      parameters: parameters || {},
      source: "api",
      enabled: true,
    });
    await reloadRegistry(req.app);
    // Broadcast tool registry change via WebSocket
    try {
      const { websocket } = require(require("path").join(process.cwd(), "websocket"));
      if (websocket.wss) {
        websocket.wss.broadcast(JSON.stringify({ type: "toolRegistryChanged" }));
      }
    } catch (_) {}
    res.status(created ? 201 : 200).json({ tool: tool.toJSON ? tool.toJSON() : tool });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("tool register error:", error);
    res.status(500).json({ error: error?.message || "Failed to register tool." });
  }
});

router.put("/tools/:name", express.json(), async (req, res) => {
  try {
    const tool = await AgentTool.findByPk(req.params.name);
    if (!tool) {
      return res.status(404).json({ error: "Tool not found." });
    }
    const updates = {};
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.execution !== undefined) updates.execution = req.body.execution;
    if (req.body.modelParameters !== undefined) updates.modelParameters = req.body.modelParameters;
    if (req.body.parameters !== undefined) updates.parameters = req.body.parameters;
    if (typeof req.body.enabled === "boolean") updates.enabled = req.body.enabled;
    await tool.update(updates);
    await reloadRegistry(req.app);
    try {
      const { websocket } = require(require("path").join(process.cwd(), "websocket"));
      if (websocket.wss) {
        websocket.wss.broadcast(JSON.stringify({ type: "toolRegistryChanged" }));
      }
    } catch (_) {}
    res.status(200).json({ tool: tool.toJSON() });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("tool update error:", error);
    res.status(500).json({ error: error?.message || "Failed to update tool." });
  }
});

router.delete("/tools/:name", async (req, res) => {
  try {
    const tool = await AgentTool.findByPk(req.params.name);
    if (!tool) {
      return res.status(404).json({ error: "Tool not found." });
    }
    if (tool.source === "file") {
      // Disable file-sourced tools instead of deleting (so seed doesn't recreate)
      await tool.update({ enabled: false });
    } else {
      await tool.destroy();
    }
    await reloadRegistry(req.app);
    try {
      const { websocket } = require(require("path").join(process.cwd(), "websocket"));
      if (websocket.wss) {
        websocket.wss.broadcast(JSON.stringify({ type: "toolRegistryChanged" }));
      }
    } catch (_) {}
    res.status(200).json({ deleted: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("tool delete error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete tool." });
  }
});

// --- Conversation endpoints ---

router.get("/conversations", async (req, res) => {
  try {
    const mission = getMissionFromRequest(req);
    const conversations = await AgentConversation.findAll({
      where: { missionName: mission },
      attributes: ["conversationId", "title", "createdAt", "updatedAt"],
      order: [["updatedAt", "DESC"]],
      limit: 50,
    });
    res.status(200).json({ conversations });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("conversations list error:", error);
    res.status(500).json({ error: error?.message || "Failed to list conversations." });
  }
});

router.get("/conversations/:id", async (req, res) => {
  try {
    const conversation = await AgentConversation.findByPk(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    res.status(200).json(conversation.toJSON());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("conversation get error:", error);
    res.status(500).json({ error: error?.message || "Failed to get conversation." });
  }
});

router.delete("/conversations/:id", async (req, res) => {
  try {
    const conversation = await AgentConversation.findByPk(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    // Best-effort cleanup of Azure thread
    if (conversation.azureThreadId) {
      try {
        const cfg = haveFasEnv();
        if (cfg.ok) {
          const client = getClient(cfg.endpoint);
          await client.threads.delete(conversation.azureThreadId);
        }
      } catch (_) {
        // Non-fatal
      }
    }
    await conversation.destroy();
    res.status(200).json({ deleted: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("conversation delete error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete conversation." });
  }
});

module.exports = router;
