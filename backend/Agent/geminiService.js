require("dotenv").config();
const https = require("https");

/**
 * Gemini API configuration
 */
function haveGeminiEnv() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

  if (!apiKey) {
    return { ok: false, missing: ["GEMINI_API_KEY"] };
  }

  return { ok: true, apiKey, model };
}

/**
 * Make HTTPS request to Gemini API
 */
function makeGeminiRequest(apiKey, model, prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    });

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Gemini API returned status ${res.statusCode}: ${data}`));
          return;
        }

        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse Gemini response: ${error.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Gemini API request failed: ${error.message}`));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Extract text from Gemini response
 */
function extractGeminiText(response) {
  if (!response || !response.candidates || response.candidates.length === 0) {
    throw new Error("Gemini response missing candidates");
  }

  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    throw new Error("Gemini response missing content parts");
  }

  const text = candidate.content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join("");

  if (!text || !text.trim()) {
    throw new Error("Gemini returned empty response");
  }

  return text.trim();
}

/**
 * Parse JSON from Gemini response (handles markdown code blocks and plain text)
 */
function parseGeminiJson(rawText) {
  let trimmed = rawText.trim();

  // Remove markdown code blocks if present
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    trimmed = codeBlockMatch[1].trim();
  }

  // Try to extract JSON object (find the outermost { ... })
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonCandidate = jsonMatch ? jsonMatch[0] : trimmed;

  try {
    const parsed = JSON.parse(jsonCandidate);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Parsed value is not an object");
    }
    return parsed;
  } catch (error) {
    // If JSON parsing fails, return a fallback structure with the raw text as reply
    // This handles cases where Gemini returns plain text instead of JSON
    return {
      actions: [],
      reply: trimmed,
      citations: [],
    };
  }
}

/**
 * Plan with Gemini (fallback provider)
 */
async function planWithGemini(prompt, toolOptions = {}) {
  const env = haveGeminiEnv();
  if (!env.ok) {
    throw new Error(
      `Gemini not configured. Missing environment variables: ${env.missing.join(", ")}`
    );
  }

  const response = await makeGeminiRequest(env.apiKey, env.model, prompt);
  const rawText = extractGeminiText(response);
  const plan = parseGeminiJson(rawText);

  // Normalize actions (filter out invalid ones instead of throwing)
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  const normalizedActions = actions
    .filter(action => action && typeof action === "object")
    .map((action, index) => {
      if (typeof action.tool !== "string" || !action.tool.trim()) {
        console.warn(`Skipping action at index ${index}: missing 'tool' name`);
        return null;
      }
      return {
        tool: action.tool,
        args: action.args || {},
      };
    })
    .filter(Boolean);

  // Normalize citations
  const citations = Array.isArray(plan.citations) ? plan.citations : [];
  const normalizedCitations = citations
    .filter(c => c && typeof c.title === "string" && typeof c.url === "string")
    .map(c => ({ title: c.title, url: c.url }));

  // Extract reply
  let reply = typeof plan.reply === "string" && plan.reply.trim() ? plan.reply.trim() : rawText;

  return {
    actions: normalizedActions,
    reply,
    citations: normalizedCitations,
    threadId: null, // Gemini doesn't support threads
    debug: {
      provider: "gemini",
      model: env.model,
      request: {},
      response: { status: 200 },
      message: rawText,
      fallbackApplied: false,
    },
  };
}

/**
 * Stream with Gemini (fallback provider for streaming)
 * Gemini doesn't support native streaming like Azure, so we fetch the full response
 * and yield it as a single chunk to match the streaming interface.
 */
async function* streamWithGemini(prompt, toolOptions = {}) {
  const env = haveGeminiEnv();
  if (!env.ok) {
    yield {
      type: "error",
      data: `Gemini not configured. Missing environment variables: ${env.missing.join(", ")}`,
    };
    return;
  }

  try {
    // Gemini doesn't support streaming, so we fetch the full response
    const response = await makeGeminiRequest(env.apiKey, env.model, prompt);
    const rawText = extractGeminiText(response);

    // Yield the full text as tokens (simulate streaming)
    yield { type: "token", data: rawText };

    // Parse and yield the plan
    const plan = parseGeminiJson(rawText);
    const actions = Array.isArray(plan.actions) ? plan.actions : [];
    const normalizedActions = actions
      .filter(action => action && typeof action === "object")
      .map((action, index) => {
        if (typeof action.tool !== "string" || !action.tool.trim()) {
          console.warn(`Skipping action at index ${index}: missing 'tool' name`);
          return null;
        }
        return {
          tool: action.tool,
          args: action.args || {},
        };
      })
      .filter(Boolean);

    const citations = Array.isArray(plan.citations) ? plan.citations : [];
    const normalizedCitations = citations
      .filter(c => c && typeof c.title === "string" && typeof c.url === "string")
      .map(c => ({ title: c.title, url: c.url }));

    let reply = typeof plan.reply === "string" && plan.reply.trim() ? plan.reply.trim() : rawText;

    yield {
      type: "plan",
      data: {
        actions: normalizedActions,
        reply,
        citations: normalizedCitations,
        threadId: null,
      },
    };

    yield { type: "done", data: { threadId: null } };
  } catch (error) {
    yield { type: "error", data: error.message || "Gemini streaming failed" };
  }
}

module.exports = {
  haveGeminiEnv,
  planWithGemini,
  streamWithGemini,
};
