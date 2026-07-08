# Agent Provider Fallback System

The MMGIS Copilot agent uses a fallback provider system to ensure high availability.

## Provider Priority

1. **Azure AI Agent Service** (Primary)
   - Uses Azure's managed agent service with thread support
   - Requires Azure credentials and permissions
   
2. **Google Gemini** (Fallback)
   - Free-tier REST API
   - No thread persistence
   - Automatically used when Azure fails or is not configured

## Configuration

### Azure (Primary Provider)

Set these environment variables in `.env`:

```bash
# Azure AI Agent Service
AZURE_AGENT_PROJECT_CONNECTION_STRING=<your-connection-string>
AZURE_API_VERSION=2024-12-01-preview

# Or alternatively
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-key>
```

### Gemini (Fallback Provider)

Set these environment variables in `.env`:

```bash
# Get free API key from https://aistudio.google.com/app/apikey
GEMINI_API_KEY=<your-api-key>

# Optional: override model (defaults to gemini-2.0-flash-exp)
GEMINI_MODEL=gemini-2.0-flash-exp
```

## How Fallback Works

### Automatic Failover

```
User Request
    ↓
Is Azure configured?
    ├─ Yes → Try Azure
    │         ├─ Success → Return Azure response
    │         └─ Error → Log warning → Use Gemini
    └─ No → Use Gemini directly
```

### Common Azure Errors that Trigger Fallback

1. **Permission Errors**
   ```
   The principal lacks the required data action 
   `Microsoft.CognitiveServices/accounts/AIServices/agents/read`
   ```
   
2. **Connection Errors**
   - Network timeout
   - Invalid endpoint
   - Service unavailable

3. **Configuration Errors**
   - Missing environment variables
   - Invalid connection string
   - Expired credentials

### Response Format

Both providers return the same format:

```json
{
  "actions": [
    {
      "tool": "toggle_layer",
      "args": { "name": "Vessels (Live AIS)", "visible": true }
    }
  ],
  "reply": "Showing vessels on the map.",
  "citations": [],
  "threadId": null,
  "debug": {
    "provider": "gemini",
    "azureError": "The principal lacks the required data action...",
    "model": "gemini-2.0-flash-exp"
  }
}
```

## Differences Between Providers

| Feature | Azure | Gemini |
|---------|-------|--------|
| Thread persistence | ✅ Yes | ❌ No |
| Conversation memory | ✅ Yes (via threads) | ❌ No |
| Grounding/Search | ✅ Bing integration | ❌ No |
| Cost | 💰 Paid | 🆓 Free tier |
| Rate limits | High | 15 RPM (free tier) |
| Setup complexity | High (Azure permissions) | Low (just API key) |

## Monitoring Fallback Usage

Check the `debug.provider` field in the response:

```javascript
const response = await fetch('/api/agent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Show vessels' })
});

const data = await response.json();
console.log('Provider used:', data.debug.provider); // "azure" or "gemini"
if (data.debug.azureError) {
  console.warn('Azure failed:', data.debug.azureError);
}
```

## Logs

Watch the server logs for fallback events:

```bash
# Docker logs
docker logs -f mmgis-mmgis-1 2>&1 | grep -i "fallback\|gemini\|azure"

# Look for:
# "Azure Agent Service failed: ... Falling back to Gemini."
# "Azure not configured (missing: ...). Using Gemini."
```

## Troubleshooting

### Azure Permission Error

If you see:
```
The principal lacks the required data action 
`Microsoft.CognitiveServices/accounts/AIServices/agents/read`
```

**Solution:** The system will automatically fall back to Gemini. To fix Azure:

1. Go to Azure Portal → AI Services → Your resource
2. Access Control (IAM) → Add role assignment
3. Assign role: **Cognitive Services User** or **Cognitive Services OpenAI User**
4. Restart the MMGIS container

### Gemini Not Working

If both providers fail:

```bash
# Check Gemini configuration
docker exec mmgis-mmgis-1 printenv | grep GEMINI

# Test Gemini API key
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY"
```

**Common issues:**
- API key not set in `.env`
- Rate limit exceeded (15 requests/minute on free tier)
- API key invalid or expired

### Force Gemini (Bypass Azure)

To test Gemini directly, temporarily remove Azure credentials:

```bash
# In .env, comment out Azure vars:
# AZURE_AGENT_PROJECT_CONNECTION_STRING=
# AZURE_OPENAI_ENDPOINT=

# Restart container
docker restart mmgis-mmgis-1
```

## Getting API Keys

### Azure AI Agent Service

1. Create Azure AI resource: https://portal.azure.com
2. Navigate to Keys and Endpoint
3. Copy connection string or endpoint + key
4. Assign required permissions (see docs)

### Google Gemini

1. Visit: https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key (starts with `AIza...`)
4. Paste into `.env` as `GEMINI_API_KEY`

**Free Tier Limits:**
- 15 requests per minute
- 1,500 requests per day
- 1 million tokens per day

## Testing the Fallback

### Test 1: Force Azure Error

```bash
# Set invalid Azure credentials
export AZURE_AGENT_PROJECT_CONNECTION_STRING="invalid"

# Make a request
curl -X POST http://localhost:8888/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message":"Show vessels"}'

# Should see Gemini response with debug.provider="gemini"
```

### Test 2: Verify Gemini Works

```bash
# Remove all Azure env vars, keep only Gemini
curl -X POST http://localhost:8888/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message":"List layers"}'

# Should return success with debug.provider="gemini"
```

## Best Practices

1. **Always configure both providers** for high availability
2. **Monitor logs** for frequent fallbacks (indicates Azure permission issues)
3. **Use Azure for production** (better thread support, no rate limits)
4. **Use Gemini for development** (free, easy setup, no Azure permissions needed)
5. **Check `debug.provider`** in responses to track which provider was used

## Code Reference

- **Provider logic**: `API/Frozon-MMGIS-Plugin-Backend/Agent/provider.js`
- **Azure service**: `API/Frozon-MMGIS-Plugin-Backend/Agent/azureService.js`
- **Gemini service**: `API/Frozon-MMGIS-Plugin-Backend/Agent/geminiService.js`
- **Environment config**: `.env` and `sample.env`
