# mc-changelog-mcp

MCP server for Minecraft modpack changelog generation and version comparison.

## Tools

| Tool | Description |
|------|-------------|
| `compare_modpacks` | Compare two modpack directories and list added/removed/changed mods |
| `generate_changelog` | Generate a Markdown-format changelog from a modpack directory |
| `generate_text_summary` | Generate a plain-text summary (suitable for Discord/forum posts) |
| `get_mod_version_info` | Query Modrinth for a mod's version history (requires network) |
| `save_changelog` | Save a generated changelog to a file |
| `generate_full_changelog` | Generate a full changelog including Modrinth version info for each mod |

## Quick Start

```bash
npm install
npm run build
node dist/index.js
```

## MCP Client Configuration

```json
{
  "mcpServers": {
    "mc-changelog": {
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"]
    }
  }
}
```

> **Path note:** `${workspaceFolder}` resolves to the project root in Trae/VS Code. On other editors use the absolute path: `["C:/path/to/mc-changelog-mcp/dist/index.js"]`（把 `C:/path/to/` 替换成你的实际路径）。

## Configuration

本工具零配置即可用（内置默认值，任何环境开箱即用）。以下项目可通过环境变量或项目根目录 `.env` 文件覆盖（复制 `.env.example` 为 `.env`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODRINTH_API_BASE` | `https://api.modrinth.com/v2` | Modrinth API 根地址，支持自建网关/代理 |
| `CHANGELOG_USER_AGENT` | `mc-changelog-mcp/1.0` | 请求 User-Agent（Modrinth 要求标明来源） |
| `CHANGELOG_MODS_DIR` | `mods` | 整合包内模组所在子目录名 |
| `CHANGELOG_ENRICH_LIMIT` | `5` | 增强信息（enrich）时每个模组返回的版本数量上限 |

优先级：环境变量 > `.env` 文件 > 内置默认值。改动后重启 MCP server 生效。

## Testing

```bash
npm run build
npm run test:unit   # Unit tests (100% offline)
npm test            # Integration tests (requires network for Modrinth API)
```

## Requirements

- Node.js 18+
- `@modelcontextprotocol/sdk`, `zod`
- Network access required only for `get_mod_version_info` and `generate_full_changelog`

## Architecture

```
mc-changelog-mcp/
├── src/
│   ├── index.ts                     # MCP server + all tool implementations
│   └── changelog-templates.json     # Changelog template definitions
├── dist/                            # Compiled JavaScript
├── skills/
│   └── mc-changelog-helper.md       # Trae Work skill
├── __tests__/
│   └── unit.test.ts                 # Unit tests (fully offline)
├── test.js                          # Integration test runner
├── test_logs/                       # Test output logs (gitignored)
├── package.json
├── tsconfig.json
└── .gitignore
```

## License

MIT
