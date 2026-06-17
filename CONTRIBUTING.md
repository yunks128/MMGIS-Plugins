# Contributing to MMGIS-Plugins

Thank you for your interest in contributing plugins to MMGIS!

## Do You Need This Repo?

MMGIS-Plugins is specifically for **official and vetted** plugins maintained by or approved by the MMGIS team. If you're building a plugin for your own mission, team, or project, you don't need to contribute here — just create your own repository with the standard plugin directory structure and install it directly:

```bash
npm run plugins -- install https://github.com/your-org/your-plugins.git
```

The MMGIS plugin system supports any git repo or local path as a plugin source. See the [MMGIS Plugin System docs](https://github.com/NASA-AMMOS/MMGIS/blob/development/plugins/README.md) for details.

This repository is for plugins that the MMGIS team has reviewed, tested, and approved for broader use.

## Plugin Structure

Every plugin must follow the standard MMGIS plugin directory layout:

```
<type>/<PluginName>/
├── plugin.json            # Required — manifest with metadata and config
├── <PluginName>Tool.js    # Entry point (tools and components)
├── <PluginName>Tool.css   # Styles (tools and components)
├── plugin.js              # Lifecycle hooks (backend only)
├── routes/                # Express routes (backend only)
├── models/                # Sequelize models (backend only)
└── tests/
    └── <pluginName>.spec.js
```

Place your plugin under the appropriate type directory at the repo root: `tools/`, `backend/`, or `components/`.

## plugin.json Requirements

Your `plugin.json` must include at minimum:

| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | Must match the directory name |
| `type` | Yes | `tool`, `backend`, or `component` |
| `version` | Yes | Semver (e.g., `1.0.0`) |
| `description` | Yes | One-line summary |
| `author` | Yes | Your name or organization |
| `license` | Yes | SPDX identifier (e.g., `Apache-2.0`, `MIT`) |
| `tier` | Yes | `official` or `experimental` |
| `paths` | Tools/Components | Entry point mapping |
| `pluginDependencies` | If applicable | Array of plugin IDs this plugin requires (e.g., `["core/backend/Utils"]`) |

See the [MMGIS plugin.json reference](https://github.com/NASA-AMMOS/MMGIS/blob/development/plugins/README.md#pluginjson-reference) for the full schema.

## Submitting a Plugin

1. **Open an issue** describing the plugin you'd like to contribute and its use case
2. **Fork** this repository
3. **Create a branch**: `git checkout -b add-my-plugin`
4. **Add your plugin** under the appropriate type directory
5. **Include tests** in a `tests/` subdirectory
6. **Validate** your manifest by copying your plugin into an MMGIS installation and running:
   ```bash
   npm run plugins -- validate
   ```
7. **Open a PR** with:
   - A description of what the plugin does
   - Any MMGIS version requirements (set `engines.mmgis` in plugin.json)
   - Screenshots or usage examples if applicable

## Guidelines

- Follow the code style of existing MMGIS plugins
- Do not bundle unnecessary dependencies — declare them in `plugin.json` under `dependencies.npm` or `dependencies.python`
- If your plugin depends on a backend, declare it in `pluginDependencies`
- If your plugin uses a license other than Apache-2.0, include a `LICENSE` file in your plugin directory and set the `license` field in `plugin.json`
- Keep plugins self-contained — avoid modifying or depending on MMGIS internals beyond the documented plugin API
- Include a `description` and `descriptionFull` in your plugin.json so users understand what the plugin does before installing

## Testing Locally

```bash
# From your MMGIS installation
npm run plugins -- install /path/to/your/MMGIS-Plugins-fork
npm run plugins -- validate
npm run test:unit
```

## Code of Conduct

This project follows the same [Code of Conduct](CODE_OF_CONDUCT.md) as the main MMGIS project.
