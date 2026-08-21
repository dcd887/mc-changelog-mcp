# mc-changelog-mcp

MCP server for Minecraft modpack changelog generation and version comparison.

## Tools

- `compare_modpacks` — 比较两个整合包目录的差异
- `generate_changelog` — 生成 Markdown 格式 Changelog
- `generate_text_summary` — 生成纯文本格式变更记录（适合 Discord/论坛）
- `get_mod_version_info` — 查询 Modrinth 模组版本历史
- `save_changelog` — 保存 Changelog 到文件
- `generate_full_changelog` — 生成包含 Modrinth 版本信息的完整 Changelog

## Quick Start

```bash
npm install
npm run build
node dist/index.js
```

## Testing

```bash
npm run test:unit   # Unit tests (100% offline)
node test.js        # Integration tests (requires network for Modrinth)
```
