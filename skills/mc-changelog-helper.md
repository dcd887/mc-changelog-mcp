---
name: mc-changelog-helper
description: 用于从两个整合包目录生成变更日志，识别新增/删除/更新的模组。当用户要"生成 changelog"、"查看版本差异"、"对比两个整合包版本"时使用。
---

# mc-changelog-mcp 使用指南

## 工具列表

### compare_modpacks
比较两个整合包目录，返回新增、删除、更新的模组列表。

参数：
- `old_pack_dir`: 旧版本整合包根目录
- `new_pack_dir`: 新版本整合包根目录

### generate_changelog
生成 Markdown 格式的 Changelog。

参数：
- `old_pack_dir`: 旧版本整合包根目录
- `new_pack_dir`: 新版本整合包根目录
- `old_version`: 可选，旧版本标签（如 v1.0.0）
- `new_version`: 可选，新版本标签（如 v1.1.0）

### generate_text_summary
生成紧凑的纯文本格式，适合粘贴到 Discord 频道或群聊。

参数：
- `old_pack_dir`: 旧版本整合包根目录
- `new_pack_dir`: 新版本整合包根目录
- `old_version`: 可选版本标签
- `new_version`: 可选版本标签

### get_mod_version_info
查询 Modrinth 上某个模组的版本历史信息。

参数：
- `mod_name`: 模组名称或 slug
- `limit`: 可选，返回版本数量上限

### save_changelog
将 Changelog 内容保存到指定文件。

参数：
- `output_path`: 输出文件路径（如 C:/Users/xxx/Desktop/changelog.md）
- `content`: 要保存的内容

### generate_full_changelog
生成包含 Modrinth 版本历史的完整 Changelog（需要网络，较慢）。

参数：
- `old_pack_dir`: 旧版本整合包根目录
- `new_pack_dir`: 新版本整合包根目录
- `old_version`: 可选旧版本标签
- `new_version`: 可选新版本标签
- `format`: markdown 或 text

## 典型工作流

1. 用户说："帮我看看这次更新改了哪些模组"
   → 调用 `compare_modpacks` 获取差异
   → 根据结果调用 `generate_text_summary` 输出 Discord 格式

2. 用户说："生成一份正式的 changelog"
   → 调用 `compare_modpacks` 获取差异
   → 调用 `generate_changelog` 生成 Markdown
   → 调用 `save_changelog` 保存到文件

3. 用户说："这个模组最新版本是什么"
   → 调用 `get_mod_version_info`
