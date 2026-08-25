const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

// ── Config（全部可被环境变量覆盖，默认值保证任何环境开箱即用、可移植）───────

/** 从项目根目录的 .env 读取键值到 process.env（仅当未设置时写入，不引入依赖）。 */
function loadEnvFile(): void {
  try {
    const envPath = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq > 0) {
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (k && !(k in process.env)) process.env[k] = v;
      }
    }
  } catch { /* .env 缺失/损坏时忽略，继续用环境变量与默认值 */ }
}
loadEnvFile();

const CONFIG = {
  // Modrinth API 根地址（支持自建网关/代理）
  modrinthBase: process.env.MODRINTH_API_BASE || "https://api.modrinth.com/v2",
  // 请求 User-Agent（Modrinth 要求标明来源）
  userAgent: process.env.CHANGELOG_USER_AGENT || "mc-changelog-mcp/1.0",
  // 整合包内模组所在的子目录名
  modsDir: process.env.CHANGELOG_MODS_DIR || "mods",
  // 增强信息（enrich）时每个模组返回的版本数量上限
  enrichLimit: parseInt(process.env.CHANGELOG_ENRICH_LIMIT || "5", 10) || 5,
};

// ── Modrinth API helpers ───────────────────────────────────────────────

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, { headers: { "User-Agent": CONFIG.userAgent } }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`)); }
      });
    }).on("error", reject);
  });
}

// ── Pack file scanning ────────────────────────────────────────────────

function scanModsDir(dir) {
  const modsDir = path.join(dir, CONFIG.modsDir);
  if (!fs.existsSync(modsDir)) return [];
  return fs.readdirSync(modsDir)
    .filter((f) => f.endsWith(".jar") && !f.includes("-sources"))
    .map((f) => {
      const base = f.replace(/\.jar$/, "");
      // Extract mod name (everything before last dash-separator version)
      const lastDash = base.lastIndexOf("-");
      const name = lastDash > 0 ? base.substring(0, lastDash) : base;
      return { file: f, name: name.toLowerCase() };
    });
}

function getPackMeta(packDir) {
  const versionFile = path.join(packDir, "version.txt");
  const loaderFile = path.join(packDir, "loader.txt");
  return {
    mcVersion: fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : undefined,
    loader: fs.existsSync(loaderFile) ? fs.readFileSync(loaderFile, "utf8").trim() : undefined,
  };
}

// ── Core functions ────────────────────────────────────────────────────

/**
 * Compare two modpack directories and return the diff.
 */
export function compareModpacks(oldPackDir: string, newPackDir: string): any {
  const oldMods = scanModsDir(oldPackDir);
  const newMods = scanModsDir(newPackDir);
  const oldNames = new Set(oldMods.map((m) => m.name));
  const newNames = new Set(newMods.map((m) => m.name));

  const added = newMods.filter((m) => !oldNames.has(m.name));
  const removed = oldMods.filter((m) => !newNames.has(m.name));
  const common = oldMods.filter((m) => newNames.has(m.name));

  const updated = [];
  for (const mod of common) {
    const oldVersion = mod.file.match(/-(\d[\d.]*[^-]*)\.jar$/i);
    const newMod = newMods.find((n) => n.name === mod.name);
    const newVersion = newMod.file.match(/-(\d[\d.]*[^-]*)\.jar$/i);
    if (oldVersion && newVersion && oldVersion[1] !== newVersion[1]) {
      updated.push({
        name: mod.name,
        oldVersion: oldVersion[1],
        newVersion: newVersion[1],
        file: newMod.file,
      });
    }
  }

  return { added, removed, updated, totalCount: added.length + removed.length + updated.length };
}

/**
 * Generate a changelog in the specified format from a comparison result.
 */
export function generateChangelog(diff, options) {
  const opts = options || {};
  const oldVersion = opts.oldVersion ?? "Previous";
  const newVersion = opts.newVersion ?? "Current";
  const title = opts.title ?? `Changelog (${oldVersion} → ${newVersion})`;

  const lines = ["# " + title, ""];

  if (diff.added.length > 0) {
    lines.push("## New");
    for (const mod of diff.added) {
      const verMatch = mod.file.match(/-(\d[\d.]*[^-]*)\.jar$/i);
      lines.push("- **" + mod.name + "\"" + (verMatch ? " (" + verMatch[1] + ")" : ""));
    }
    lines.push("");
  }

  if (diff.updated.length > 0) {
    lines.push("## Updated");
    for (const mod of diff.updated) {
      lines.push("- **" + mod.name + "**: " + mod.oldVersion + " → " + mod.newVersion);
    }
    lines.push("");
  }

  if (diff.removed.length > 0) {
    lines.push("## Removed");
    for (const mod of diff.removed) {
      const verMatch = mod.file.match(/-(\d[\d.]*[^-]*)\.jar$/i);
      lines.push("- **" + mod.name + "\"" + (verMatch ? " (" + verMatch[1] + ")" : ""));
    }
    lines.push("");
  }

  if (diff.totalCount === 0) {
    lines.push("No changes detected between the two versions.");
  }

  return lines.join("\n");
}

/**
 * Query Modrinth for version history of a mod to enrich the changelog.
 */
export async function enrichWithVersionInfo(modName, limit) {
  const lim = limit || CONFIG.enrichLimit;
  try {
    const results = await fetchJSON(
      CONFIG.modrinthBase + "/search?query=" + encodeURIComponent(modName) + "&limit=3&index=relevance"
    );
    const hits = results.hits || [];
    const match = hits.find((hit) =>
      hit.slug === modName || modName.includes(hit.slug)
    );
    if (!match) return null;
    const info = await fetchJSON(CONFIG.modrinthBase + "/project/" + match.project_id);
    const versionFiles = info.versions || [];
    const versions = versionFiles.map((v) => ({
      number: v.version_number,
      date: v.date_published,
      loaders: v.loaders || [],
    })).slice(0, lim);
    return {
      project_id: info.id,
      slug: info.slug,
      name: info.title || info.name,
      description: info.description || "",
      url: "https://modrinth.com/mod/" + info.slug,
      recentVersions: versions,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Generate a full changelog from two pack directories, enriched with Modrinth data.
 */
export async function generateFullChangelog(oldPackDir: string, newPackDir: string, options?: any): Promise<any> {
  const opts = options || {};
  const diff = compareModpacks(oldPackDir, newPackDir);
  const format = opts.format || "markdown";
  const enriched = opts.enrich || false;
  const oldMeta = getPackMeta(oldPackDir);
  const newMeta = getPackMeta(newPackDir);

  const result: any = {
    format: format,
    oldVersion: oldMeta.mcVersion,
    newVersion: newMeta.mcVersion,
    oldLoader: oldMeta.loader,
    newLoader: newMeta.loader,
    added: diff.added,
    removed: diff.removed,
    updated: diff.updated,
    totalChanges: diff.totalCount,
  };

  if (enriched) {
    const enrichedItems = [];
    for (const mod of diff.added.concat(diff.updated)) {
      const info = await enrichWithVersionInfo(mod.name, 5);
      enrichedItems.push(Object.assign({}, mod, { modrinth: info }));
    }
    result.enriched = enrichedItems;
  }

  result.text = generateChangelog(diff, {
    oldVersion: opts.oldVersion || oldMeta.mcVersion || "Previous",
    newVersion: opts.newVersion || newMeta.mcVersion || "Current",
  });

  return result;
}

/**
 * Generate a plain-text summary suitable for copy-paste into Discord/forum posts.
 */
export function generateTextSummary(diff, options) {
  const opts = options || {};
  const lines = [];
  const pad = (text, len) => {
    len = len || 40;
    return text.length >= len ? text.substring(0, len) : text + new Array(len - text.length + 1).join(" ");
  };

  lines.push("=== Changelog ===");
  lines.push("Old: " + (opts.oldVersion || "Previous"));
  lines.push("New: " + (opts.newVersion || "Current"));
  lines.push("");

  if (diff.added.length > 0) {
    lines.push("NEW (" + diff.added.length + "):");
    for (const mod of diff.added) {
      const verMatch = mod.file.match(/-(\d[\d.]*[^-]*)\.jar$/i);
      lines.push("  + " + pad(mod.name, 35) + (verMatch ? verMatch[1] : ""));
    }
  }

  if (diff.updated.length > 0) {
    lines.push("UPDATED (" + diff.updated.length + "):");
    for (const mod of diff.updated) {
      lines.push("  ~ " + pad(mod.name, 35) + mod.oldVersion + " → " + mod.newVersion);
    }
  }

  if (diff.removed.length > 0) {
    lines.push("REMOVED (" + diff.removed.length + "):");
    for (const mod of diff.removed) {
      const verMatch = mod.file.match(/-(\d[\d.]*[^-]*)\.jar$/i);
      lines.push("  - " + pad(mod.name, 35) + (verMatch ? verMatch[1] : ""));
    }
  }

  if (diff.totalCount === 0) {
    lines.push("No changes detected.");
  }

  return lines.join("\n");
}

/**
 * Save a generated changelog to a file.
 */
export function saveChangelog(outputPath: string, content: string): { path: string; bytes: number } {
  const resolved = path.resolve(outputPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, content);
  return { path: resolved, bytes: Buffer.byteLength(content) };
}

// ── MCP Server ────────────────────────────────────────────────────────

async function main() {
  const server = new McpServer({
    name: "mc-changelog-mcp",
    version: "1.0.0",
  });

  server.tool(
    "compare_modpacks",
    "比较两个整合包目录的差异，返回新增、删除、更新的模组列表",
    {
      old_pack_dir: z.string().describe("旧版本整合包根目录路径"),
      new_pack_dir: z.string().describe("新版本整合包根目录路径"),
    },
    async ({ old_pack_dir, new_pack_dir }) => {
      try {
        const diff = compareModpacks(old_pack_dir, new_pack_dir);
        return { content: [{ type: "text", text: JSON.stringify(diff, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "比较失败: " + e.message }], isError: true };
      }
    }
  );

  server.tool(
    "generate_changelog",
    "根据整合包差异生成 Markdown 格式的 Changelog",
    {
      old_pack_dir: z.string().describe("旧版本整合包根目录路径"),
      new_pack_dir: z.string().describe("新版本整合包根目录路径"),
      old_version: z.string().optional().describe("旧版本标签（如 v1.0.0）"),
      new_version: z.string().optional().describe("新版本标签（如 v1.1.0）"),
    },
    async ({ old_pack_dir, new_pack_dir, old_version, new_version }) => {
      try {
        const diff = compareModpacks(old_pack_dir, new_pack_dir);
        const text = generateChangelog(diff, { oldVersion: old_version, newVersion: new_version });
        return { content: [{ type: "text", text }] };
      } catch (e) {
        return { content: [{ type: "text", text: "生成失败: " + e.message }], isError: true };
      }
    }
  );

  server.tool(
    "generate_text_summary",
    "生成简洁的纯文本格式变更记录，适合复制粘贴到 Discord/论坛/群聊",
    {
      old_pack_dir: z.string().describe("旧版本整合包根目录路径"),
      new_pack_dir: z.string().describe("新版本整合包根目录路径"),
      old_version: z.string().optional().describe("旧版本标签"),
      new_version: z.string().optional().describe("新版本标签"),
    },
    async ({ old_pack_dir, new_pack_dir, old_version, new_version }) => {
      try {
        const diff = compareModpacks(old_pack_dir, new_pack_dir);
        const text = generateTextSummary(diff, { oldVersion: old_version, newVersion: new_version });
        return { content: [{ type: "text", text }] };
      } catch (e) {
        return { content: [{ type: "text", text: "生成失败: " + e.message }], isError: true };
      }
    }
  );

  server.tool(
    "get_mod_version_info",
    "查询 Modrinth 上某个模组的历史版本信息（发布日期、加载器支持等）",
    {
      mod_name: z.string().describe("模组名称或 slug（如 sodium、fabric-api）"),
      limit: z.number().optional().describe("返回版本数量上限，默认 5"),
    },
    async ({ mod_name, limit }) => {
      try {
        const info = await enrichWithVersionInfo(mod_name, limit || 5);
        if (!info) return { content: [{ type: "text", text: "未找到模组: " + mod_name }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "查询失败: " + e.message }], isError: true };
      }
    }
  );

  server.tool(
    "save_changelog",
    "将生成的 Changelog 保存到指定文件路径",
    {
      output_path: z.string().describe("输出文件路径，如 C:/Users/xxx/Desktop/changelog.md"),
      content: z.string().describe("要保存的 changelog 内容"),
    },
    async ({ output_path, content }) => {
      try {
        const result = saveChangelog(output_path, content);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "保存失败: " + e.message }], isError: true };
      }
    }
  );

  server.tool(
    "generate_full_changelog",
    "生成包含 Modrinth 版本历史信息的完整 Changelog（网络请求较多，较慢）",
    {
      old_pack_dir: z.string().describe("旧版本整合包根目录路径"),
      new_pack_dir: z.string().describe("新版本整合包根目录路径"),
      old_version: z.string().optional().describe("旧版本标签"),
      new_version: z.string().optional().describe("新版本标签"),
      format: z.enum(["markdown", "text"]).optional().describe("输出格式，默认 markdown"),
    },
    async ({ old_pack_dir, new_pack_dir, old_version, new_version, format }) => {
      try {
        const result = await generateFullChangelog(
          old_pack_dir, new_pack_dir,
          { format: format || "markdown", oldVersion: old_version, newVersion: new_version, enrich: true }
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "生成失败: " + e.message }], isError: true };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("Fatal error in mc-changelog-mcp:", e);
  process.exit(1);
});
