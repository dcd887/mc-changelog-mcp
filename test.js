const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const mcpPath = path.join(__dirname, "dist", "index.js");
const logDir = path.join(__dirname, "test_logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_FILE = path.join(logDir, `test_${TIMESTAMP}.log`);

function log(msg) {
  const line = `[${new Date().toLocaleTimeString("zh-CN")}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

log(`MCP test started at ${new Date().toISOString()}`);
log(`MCP binary: ${mcpPath}`);

const proc = spawn("node", [mcpPath], { stdio: ["pipe", "pipe", "pipe"] });

let buffer = "";

proc.stdout.on("data", (data) => {
  const chunk = data.toString();
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) {
      try {
        const parsed = JSON.parse(line);
        log(`[OUT] ${JSON.stringify(parsed).slice(0, 300)}`);
      } catch {
        log(`[RAW OUT] ${line.slice(0, 200)}`);
      }
    }
  }
});

proc.stderr.on("data", (data) => {
  const s = data.toString();
  process.stderr.write("STDERR: " + s);
  log(`[STDERR] ${s.trim()}`);
});

proc.on("error", (e) => log(`进程启动失败: ${e.message}`));
proc.on("close", (code) => log(`MCP 进程退出码: ${code}`));

function send(id, method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  log(`→ 发送工具调用 id=${id} method=${method}`);
  proc.stdin.write(msg + "\n");
}

function waitForOutput(timeout = 3000) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

async function runTest(id, method, params, description) {
  log(`\n--- 测试 ${id}: ${description} ---`);
  send(id, method, params);
  await waitForOutput(2000);
}

(async () => {
  try {
    await waitForOutput(1500);

    // Test 1: tools/list
    await runTest(
      1,
      "tools/list",
      {},
      "列出可用工具"
    );

    // Test 2: compare_modpacks
    const tmpDir = os.tmpdir();
    const testDir = path.join(tmpDir, `mcp-chg-int-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, "old", "mods"), { recursive: true });
    fs.mkdirSync(path.join(testDir, "new", "mods"), { recursive: true });
    fs.writeFileSync(path.join(testDir, "old", "mods", "sodium-0.5.8.jar"), "");
    fs.writeFileSync(path.join(testDir, "old", "mods", "fabric-api-0.92.0.jar"), "");
    fs.writeFileSync(path.join(testDir, "new", "mods", "sodium-0.6.0.jar"), "");
    fs.writeFileSync(path.join(testDir, "new", "mods", "iris-1.7.0.jar"), "");
    fs.writeFileSync(path.join(testDir, "old", "version.txt"), "1.20.1");
    fs.writeFileSync(path.join(testDir, "new", "version.txt"), "1.20.1");
    fs.writeFileSync(path.join(testDir, "old", "loader.txt"), "fabric");
    fs.writeFileSync(path.join(testDir, "new", "loader.txt"), "fabric");

    await runTest(
      2,
      "tools/call",
      { name: "compare_modpacks", arguments: { old_pack_dir: path.join(testDir, "old"), new_pack_dir: path.join(testDir, "new") } },
      "比较两个整合包"
    );

    await runTest(
      3,
      "tools/call",
      { name: "generate_changelog", arguments: { old_pack_dir: path.join(testDir, "old"), new_pack_dir: path.join(testDir, "new"), old_version: "v1.0", new_version: "v1.1" } },
      "生成 Changelog"
    );

    await runTest(
      4,
      "tools/call",
      { name: "generate_text_summary", arguments: { old_pack_dir: path.join(testDir, "old"), new_pack_dir: path.join(testDir, "new") } },
      "生成文本摘要"
    );

    await runTest(
      5,
      "tools/call",
      { name: "save_changelog", arguments: { output_path: path.join(testDir, "changelog.md"), content: "# Test\n- Added sodium" } },
      "保存 Changelog"
    );

    log("\n=== 所有测试完成 ===");
    log(`完整输出已保存到: ${LOG_FILE}`);
    proc.kill();
  } catch (e) {
    log(`测试异常: ${e.message}`);
    proc.kill();
  }
  process.exit(0);
})();
