const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const mod = require("../dist/index");

describe("compareModpacks", () => {
  let tmpDir;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-chg-"));
  });
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("returns empty diff when both packs are identical", () => {
    const oldDir = path.join(tmpDir, "old");
    const newDir = path.join(tmpDir, "new");
    ["old", "new"].forEach((d) => {
      const mods = path.join(tmpDir, d, "mods");
      fs.mkdirSync(mods, { recursive: true });
      fs.writeFileSync(path.join(mods, "sodium-0.5.8.jar"), "");
      fs.writeFileSync(path.join(mods, "fabric-api-0.92.0.jar"), "");
    });
    const diff = mod.compareModpacks(oldDir, newDir);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.removed.length, 0);
    assert.equal(diff.updated.length, 0);
    assert.equal(diff.totalCount, 0);
  });

  it("detects added and removed mods", () => {
    const oldDir = path.join(tmpDir, "old2");
    const newDir = path.join(tmpDir, "new2");
    [oldDir, newDir].forEach((d) => {
      fs.mkdirSync(path.join(d, "mods"), { recursive: true });
    });
    fs.writeFileSync(path.join(oldDir, "mods", "sodium-0.5.8.jar"), "");
    fs.writeFileSync(path.join(oldDir, "mods", "fabric-api-0.92.0.jar"), "");
    fs.writeFileSync(path.join(newDir, "mods", "sodium-0.6.0.jar"), "");
    fs.writeFileSync(path.join(newDir, "mods", "iris-1.7.0.jar"), "");
    const diff = mod.compareModpacks(oldDir, newDir);
    assert.ok(diff.added.some((m) => m.name === "iris"));
    assert.ok(diff.removed.some((m) => m.name === "fabric-api"));
  });

  it("detects version-updated mods", () => {
    const oldDir = path.join(tmpDir, "old3");
    const newDir = path.join(tmpDir, "new3");
    [oldDir, newDir].forEach((d) => {
      fs.mkdirSync(path.join(d, "mods"), { recursive: true });
    });
    fs.writeFileSync(path.join(oldDir, "mods", "sodium-0.5.8.jar"), "");
    fs.writeFileSync(path.join(newDir, "mods", "sodium-0.6.0.jar"), "");
    const diff = mod.compareModpacks(oldDir, newDir);
    assert.equal(diff.updated.length, 1);
    assert.equal(diff.updated[0].name, "sodium");
    assert.equal(diff.updated[0].oldVersion, "0.5.8");
    assert.equal(diff.updated[0].newVersion, "0.6.0");
  });

  it("handles missing mods directory gracefully", () => {
    const oldDir = path.join(tmpDir, "empty-old");
    const newDir = path.join(tmpDir, "new4");
    fs.mkdirSync(newDir, { recursive: true });
    fs.mkdirSync(path.join(newDir, "mods"), { recursive: true });
    fs.writeFileSync(path.join(newDir, "mods", "sodium-0.5.8.jar"), "");
    const diff = mod.compareModpacks(oldDir, newDir);
    assert.equal(diff.removed.length, 0);
    assert.equal(diff.added.length, 1);
  });
});

describe("generateChangelog", () => {
  it("produces valid markdown with new and updated sections", () => {
    const diff = {
      added: [{ file: "sodium-0.6.0.jar", name: "sodium-0.6.0" }],
      removed: [{ file: "optifine-1.20.1.jar", name: "optifine-1.20.1" }],
      updated: [{ name: "iris", oldVersion: "1.6.0", newVersion: "1.7.0", file: "iris-1.7.0.jar" }],
      totalCount: 3,
    };
    const text = mod.generateChangelog(diff, { oldVersion: "v1.0", newVersion: "v1.1" });
    assert.ok(text.includes("# Changelog (v1.0 → v1.1)"));
    assert.ok(text.includes("## New"));
    assert.ok(text.includes("## Updated"));
    assert.ok(text.includes("## Removed"));
    assert.ok(text.includes("sodium-0.6.0"));
    assert.ok(text.includes("1.6.0 → 1.7.0"));
  });

  it("returns 'no changes' when diff is empty", () => {
    const diff = { added: [], removed: [], updated: [], totalCount: 0 };
    const text = mod.generateChangelog(diff);
    assert.ok(text.includes("No changes detected"));
  });
});

describe("generateTextSummary", () => {
  it("produces compact text format", () => {
    const diff = {
      added: [{ file: "sodium-0.6.0.jar", name: "sodium-0.6.0" }],
      removed: [],
      updated: [],
      totalCount: 1,
    };
    const text = mod.generateTextSummary(diff, { oldVersion: "v1.0", newVersion: "v1.1" });
    assert.ok(text.includes("=== Changelog ==="));
    assert.ok(text.includes("NEW (1):"));
    assert.ok(text.includes("+ sodium-0.6.0"));
  });
});

describe("saveChangelog", () => {
  it("writes changelog to file", () => {
    const tmpFile = path.join(os.tmpdir(), `changelog-test-${Date.now()}.md`);
    const result = mod.saveChangelog(tmpFile, "# Test Changelog\n\n- Added sodium");
    assert.ok(fs.existsSync(result.path));
    assert.ok(result.bytes > 0);
    const content = fs.readFileSync(result.path, "utf8");
    assert.ok(content.includes("Test Changelog"));
    fs.unlinkSync(result.path);
  });
});

describe("enrichWithVersionInfo", () => {
  it("handles offline gracefully", async () => {
    const info = await mod.enrichWithVersionInfo("nonexistent-mod-xyz");
    // Either null or a valid structure; offline should return null
    assert.ok(info === null || typeof info === "object");
  });
});

describe("generateFullChangelog", () => {
  it("handles offline gracefully for nonexistent packs", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-chg-full-"));
    try {
      const result = await mod.generateFullChangelog(
        path.join(tmpDir, "old"),
        path.join(tmpDir, "new")
      );
      assert.ok(result.totalChanges >= 0);
      assert.ok(typeof result.text === "string");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
