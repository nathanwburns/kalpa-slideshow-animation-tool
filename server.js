const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const os = require("os");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const projectsDir = path.join(dataDir, "projects");
const manifestPath = path.join(rootDir, "template-library", "manifest.json");
const rendererPath = path.join(rootDir, "render_slide.py");
const retentionHours = 48;
const maxBodyBytes = 26 * 1024 * 1024;
const cleanupIntervalMs = 30 * 60 * 1000;

const pythonCandidates = [
  process.env.PYTHON_BIN,
  path.join(
    os.homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "python",
    "bin",
    "python3"
  ),
  "python3"
].filter(Boolean);

const templateManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const sourceCues = {
  headlines: [
    "ERP Done Right by Trusted Advisors Who Know Your Business",
    "Which Challenge Sounds Familiar?",
    "What You Actually Get When You Work With Us",
    "How We Make Sure Your ERP Actually Works",
    "Ready to see what's possible?"
  ],
  industries: ["Construction", "Manufacturing", "Wholesale Distribution", "Retail"],
  proof: [
    { value: "1", label: "Clear roadmap" },
    { value: "0", label: "Guesswork" },
    { value: "1", label: "Aligned team" }
  ]
};

async function ensureDirectories() {
  await fsp.mkdir(projectsDir, { recursive: true });
}

function detectPython() {
  for (const candidate of pythonCandidates) {
    if (candidate === "python3") return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return "python3";
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".zip") return "application/zip";
  return "text/html; charset=utf-8";
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function sendFile(res, filePath, attachmentName) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "File not found." });
      return;
    }
    const headers = {
      "Content-Type": contentType(filePath),
      "Content-Length": data.length
    };
    if (attachmentName) {
      headers["Content-Disposition"] = `attachment; filename="${attachmentName}"`;
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBodyBytes) {
        reject(new Error("Request body exceeded the upload limit."));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("Invalid JSON payload."));
      }
    });
    req.on("error", reject);
  });
}

function safeSlug(input, fallback = "file") {
  const cleaned = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function clipText(value, maxLength = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function splitIdeas(text) {
  return String(text || "")
    .split(/\n|[.!?]/)
    .map((part) => clipText(part, 120))
    .filter((part) => part.length > 18)
    .slice(0, 12);
}

function pickTemplateSequence(count) {
  const ordered = [
    "kalpa-hero-opener",
    "kalpa-challenge-stack",
    "kalpa-industry-grid",
    "kalpa-offer-comparison",
    "kalpa-proof-stats",
    "kalpa-process-roadmap",
    "kalpa-challenge-stack",
    "kalpa-offer-comparison",
    "kalpa-industry-grid",
    "kalpa-proof-stats",
    "kalpa-process-roadmap",
    "kalpa-cta-close"
  ];
  return ordered.slice(0, count);
}

function durationToSlideCount(desiredMinutes, targetSlideCount) {
  if (Number.isFinite(targetSlideCount) && targetSlideCount > 0) {
    return Math.max(1, Math.min(12, Math.round(targetSlideCount)));
  }
  if (Number.isFinite(desiredMinutes) && desiredMinutes > 0) {
    return Math.max(4, Math.min(12, Math.round(desiredMinutes * 2.4)));
  }
  return 6;
}

function readTextUpload(fileRecord) {
  const ext = path.extname(fileRecord.originalName).toLowerCase();
  if (![".txt", ".md", ".markdown", ".json", ".csv"].includes(ext)) {
    return "";
  }
  try {
    return fs.readFileSync(fileRecord.storedPath, "utf8");
  } catch {
    return "";
  }
}

function buildProjectSourceSummary(payload, uploads) {
  const fileNames = uploads.map((item) => item.originalName);
  const textSnippets = uploads
    .map(readTextUpload)
    .filter(Boolean)
    .join("\n")
    .slice(0, 2200);

  return {
    prompt: clipText(payload.prompt || "", 3000),
    sourceUrl: clipText(payload.sourceUrl || "", 500),
    fileNames,
    textSnippets
  };
}

function makeSlideBase(projectId, templateId, index, title) {
  return {
    id: crypto.randomUUID(),
    projectId,
    index,
    templateId,
    title,
    version: 1,
    durationSeconds: 8,
    notes: "",
    editHistory: [],
    render: {}
  };
}

function buildSlidesFromPrompt(projectId, payload, sourceSummary, uploadedFiles) {
  const slideCount = durationToSlideCount(
    Number(payload.desiredMinutes || 0),
    Number(payload.targetSlideCount || 0)
  );
  const promptIdeas = splitIdeas(
    [payload.prompt, sourceSummary.textSnippets, payload.sourceUrl].filter(Boolean).join(". ")
  );
  const templateSequence = pickTemplateSequence(slideCount);
  const projectTitle = clipText(payload.projectTitle || "Kalpa Slideshow Project", 120);

  return templateSequence.map((templateId, index) => {
    const baseTitle = promptIdeas[index] || sourceCues.headlines[index % sourceCues.headlines.length];
    const slide = makeSlideBase(projectId, templateId, index + 1, baseTitle);
    slide.deckTitle = projectTitle;
    slide.sourcePrompt = payload.prompt || "";
    slide.sourceUrl = payload.sourceUrl || "";
    slide.uploadNames = uploadedFiles.map((item) => item.originalName);

    if (templateId === "kalpa-hero-opener") {
      slide.eyebrow = "Kalpa slideshow tool";
      slide.title = clipText(projectTitle, 88);
      slide.subtitle =
        promptIdeas[0] ||
        "Turn rough ideas, files, and links into polished animated slides that fit the Kalpa brand.";
      slide.bullets = promptIdeas.slice(1, 4);
      slide.ctaText = "Generate deck";
      slide.backgroundAsset = "hero-erp.png";
    } else if (templateId === "kalpa-challenge-stack") {
      slide.sectionKicker = "Challenges";
      slide.title = "Which challenge should this slide solve?";
      slide.cards = promptIdeas.slice(index, index + 3);
      while (slide.cards.length < 3) {
        slide.cards.push(sourceCues.headlines[(index + slide.cards.length) % sourceCues.headlines.length]);
      }
    } else if (templateId === "kalpa-industry-grid") {
      slide.sectionKicker = "Coverage";
      slide.title = promptIdeas[index] || "Industries or solution areas";
      slide.cards = sourceCues.industries.slice(0, 4);
    } else if (templateId === "kalpa-offer-comparison") {
      slide.title = "Before and after the right-fit system";
      slide.leftColumnTitle = "Current state";
      slide.leftColumnPoints = promptIdeas.slice(index, index + 3);
      while (slide.leftColumnPoints.length < 3) {
        slide.leftColumnPoints.push("Manual workarounds and disconnected reporting");
      }
      slide.rightColumnTitle = "Kalpa-shaped outcome";
      slide.rightColumnPoints = [
        "Simpler workflows with cleaner handoffs",
        "Realistic rollout pace and clearer ownership",
        "Reporting the team can actually trust"
      ];
    } else if (templateId === "kalpa-proof-stats") {
      slide.sectionKicker = "Proof";
      slide.title = promptIdeas[index] || "Key outcomes at a glance";
      slide.stats = sourceCues.proof.map((item) => ({ ...item }));
    } else if (templateId === "kalpa-process-roadmap") {
      slide.sectionKicker = "Roadmap";
      slide.title = "How the project moves from idea to rollout";
      slide.steps = ["Clarify", "Structure", "Build", "Review"];
      slide.closingReassurance = "Keep the motion simple, the message direct, and the final deck easy to present.";
    } else if (templateId === "kalpa-cta-close") {
      slide.title = "Ready to refine this into the final version?";
      slide.subtitle =
        "Download what works, re-upload the editable package later, and keep the server storage footprint low.";
      slide.ctaText = "Download deck";
      slide.contactLine = "Assets auto-delete after 48 hours unless you save them.";
      slide.backgroundAsset = "hero-bg.png";
    }

    return slide;
  });
}

function buildSlidesFromImportedPackage(projectId, packageJson) {
  const importedSlides = Array.isArray(packageJson.slides) ? packageJson.slides : [];
  return importedSlides.map((slide, index) => ({
    ...slide,
    id: crypto.randomUUID(),
    projectId,
    index: index + 1,
    version: Number(slide.version || 1),
    editHistory: Array.isArray(slide.editHistory) ? slide.editHistory : [],
    render: {}
  }));
}

function buildSlidesFromRenderedAssets(projectId, uploads, payload) {
  return uploads.map((upload, index) => {
    const slide = makeSlideBase(
      projectId,
      index === uploads.length - 1 ? "kalpa-cta-close" : "kalpa-hero-opener",
      index + 1,
      `Rebuild ${upload.originalName}`
    );
    slide.eyebrow = "Imported asset";
    slide.subtitle =
      clipText(payload.prompt || "", 180) ||
      "Approximate remake workflow. Use the edit prompt below to rebuild this slide in a cleaner Kalpa template.";
    slide.bullets = [
      `Original file: ${upload.originalName}`,
      `Type: ${upload.mimeType || "unknown"}`,
      "This rebuild approximates the old slide instead of recovering the exact source composition."
    ];
    if (upload.mimeType.startsWith("image/") || upload.originalName.endsWith(".gif")) {
      slide.uploadPreviewPath = upload.relativePath;
      slide.backgroundUpload = upload.relativePath;
    }
    return slide;
  });
}

function summarizeProject(projectManifest) {
  return {
    id: projectManifest.id,
    projectTitle: projectManifest.projectTitle,
    prompt: projectManifest.prompt,
    sourceUrl: projectManifest.sourceUrl,
    createdAt: projectManifest.createdAt,
    expiresAt: projectManifest.expiresAt,
    retentionHours: projectManifest.retentionHours,
    desiredMinutes: projectManifest.desiredMinutes,
    targetSlideCount: projectManifest.targetSlideCount,
    mode: projectManifest.mode,
    uploads: projectManifest.uploads,
    slides: projectManifest.slides.map((slide) => ({
      id: slide.id,
      index: slide.index,
      templateId: slide.templateId,
      title: slide.title,
      subtitle: slide.subtitle || "",
      version: slide.version,
      previewPath: slide.render.previewPath,
      gifPath: slide.render.gifPath,
      mp4Path: slide.render.mp4Path,
      durationSeconds: slide.durationSeconds,
      notes: slide.notes || "",
      downloadFormats: ["gif", "mp4", "png"]
    }))
  };
}

async function writeUploadFiles(projectDir, uploads) {
  const uploadsDir = path.join(projectDir, "uploads");
  await fsp.mkdir(uploadsDir, { recursive: true });

  const stored = [];
  for (const upload of uploads) {
    const [prefix, base64Value] = String(upload.base64 || "").split(",", 2);
    const payload = base64Value || prefix;
    const buffer = Buffer.from(payload, "base64");
    const storedName = `${Date.now()}-${safeSlug(upload.name, "upload")}`;
    const storedPath = path.join(uploadsDir, storedName);
    await fsp.writeFile(storedPath, buffer);
    stored.push({
      originalName: upload.name,
      mimeType: upload.type || "application/octet-stream",
      size: buffer.length,
      storedName,
      storedPath,
      relativePath: path.join("uploads", storedName).replace(/\\/g, "/")
    });
  }
  return stored;
}

async function persistProjectManifest(projectDir, manifest) {
  await fsp.writeFile(path.join(projectDir, "project.json"), JSON.stringify(manifest, null, 2));
}

async function readProjectManifest(projectId) {
  const projectPath = path.join(projectsDir, projectId, "project.json");
  const raw = await fsp.readFile(projectPath, "utf8");
  return JSON.parse(raw);
}

async function renderSlide(projectDir, slide) {
  const slideSpecDir = path.join(projectDir, "slides");
  const renderDir = path.join(projectDir, "renders");
  await fsp.mkdir(slideSpecDir, { recursive: true });
  await fsp.mkdir(renderDir, { recursive: true });
  const specPath = path.join(slideSpecDir, `${slide.id}.json`);
  await fsp.writeFile(specPath, JSON.stringify(slide, null, 2));

  const pythonBin = detectPython();
  await new Promise((resolve, reject) => {
    execFile(
      pythonBin,
      [rendererPath, specPath, renderDir],
      { cwd: rootDir, maxBuffer: 1024 * 1024 * 8 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || stdout || error.message));
          return;
        }
        resolve(stdout);
      }
    );
  });

  slide.render.previewPath = path.join("renders", `${slide.id}.png`).replace(/\\/g, "/");
  slide.render.gifPath = path.join("renders", `${slide.id}.gif`).replace(/\\/g, "/");
  slide.render.mp4Path = path.join("renders", `${slide.id}.mp4`).replace(/\\/g, "/");
}

async function renderProject(projectDir, manifest) {
  for (const slide of manifest.slides) {
    await renderSlide(projectDir, slide);
  }
  await persistProjectManifest(projectDir, manifest);
}

function applySlideEdit(slide, editPrompt) {
  const trimmed = clipText(editPrompt || "", 600);
  slide.editHistory = slide.editHistory || [];
  slide.editHistory.push({
    at: new Date().toISOString(),
    prompt: trimmed
  });
  slide.notes = trimmed;
  slide.version = Number(slide.version || 1) + 1;

  const phrases = splitIdeas(trimmed);
  if (phrases[0]) slide.subtitle = phrases[0];
  if (phrases.length > 1 && Array.isArray(slide.bullets)) {
    slide.bullets = phrases.slice(0, 3);
  }
  if (phrases.length > 1 && Array.isArray(slide.cards)) {
    slide.cards = phrases.slice(0, Math.max(3, slide.cards.length));
  }
  if (/cta|close|action/i.test(trimmed)) {
    slide.templateId = "kalpa-cta-close";
    slide.title = "Refined close";
    slide.ctaText = "Download updated deck";
  }
  if (/compare|before|after/i.test(trimmed)) {
    slide.templateId = "kalpa-offer-comparison";
  }
  if (/industry|sector|vertical/i.test(trimmed)) {
    slide.templateId = "kalpa-industry-grid";
  }
}

async function buildDeckZip(projectId, format) {
  const projectDir = path.join(projectsDir, projectId);
  const zipPath = path.join(projectDir, `${projectId}-${format}-deck.zip`);
  try {
    await fsp.unlink(zipPath);
  } catch {}

  const manifest = await readProjectManifest(projectId);
  const renderFiles = manifest.slides.map((slide) =>
    path.join(projectDir, format === "mp4" ? slide.render.mp4Path : slide.render.gifPath)
  );
  const packagePath = path.join(projectDir, `${projectId}.kalpa-project.json`);
  await fsp.writeFile(packagePath, JSON.stringify(manifest, null, 2));

  const args = ["-j", zipPath, packagePath, ...renderFiles];
  await new Promise((resolve, reject) => {
    execFile("zip", args, { cwd: projectDir, maxBuffer: 1024 * 1024 * 4 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve();
    });
  });

  return zipPath;
}

async function cleanupExpiredProjects() {
  await ensureDirectories();
  let entries = [];
  try {
    entries = await fsp.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return;
  }

  const now = Date.now();
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const manifestFile = path.join(projectsDir, entry.name, "project.json");
        try {
          const raw = await fsp.readFile(manifestFile, "utf8");
          const manifest = JSON.parse(raw);
          if (new Date(manifest.expiresAt).getTime() < now) {
            await fsp.rm(path.join(projectsDir, entry.name), { recursive: true, force: true });
          }
        } catch {
          await fsp.rm(path.join(projectsDir, entry.name), { recursive: true, force: true });
        }
      })
  );
}

function routeMatch(pathname, pattern) {
  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const token = patternParts[i];
    if (token.startsWith(":")) {
      params[token.slice(1)] = pathParts[i];
      continue;
    }
    if (token !== pathParts[i]) return null;
  }
  return params;
}

async function createProjectFromPayload(payload) {
  const uploads = Array.isArray(payload.uploads) ? payload.uploads : [];
  const projectId = crypto.randomUUID();
  const projectDir = path.join(projectsDir, projectId);
  await fsp.mkdir(projectDir, { recursive: true });

  const storedUploads = await writeUploadFiles(projectDir, uploads);

  let slides = [];
  let mode = "generated";
  const maybePackage = uploads.find((item) => item.name.endsWith(".kalpa-project.json"));
  if (maybePackage) {
    mode = "package-reupload";
    const imported = JSON.parse(Buffer.from(maybePackage.base64.split(",").pop(), "base64").toString("utf8"));
    slides = buildSlidesFromImportedPackage(projectId, imported);
  } else if (storedUploads.some((item) => item.mimeType.startsWith("image/") || item.mimeType.startsWith("video/") || item.originalName.endsWith(".gif"))) {
    mode = "rendered-asset-rebuild";
    slides = buildSlidesFromRenderedAssets(projectId, storedUploads, payload);
  } else {
    const sourceSummary = buildProjectSourceSummary(payload, storedUploads);
    slides = buildSlidesFromPrompt(projectId, payload, sourceSummary, storedUploads);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + retentionHours * 60 * 60 * 1000);
  const manifest = {
    kalpaProjectVersion: 1,
    id: projectId,
    projectTitle: clipText(payload.projectTitle || "Kalpa Slideshow Animation Tool Project", 120),
    prompt: clipText(payload.prompt || "", 4000),
    sourceUrl: clipText(payload.sourceUrl || "", 500),
    desiredMinutes: Number(payload.desiredMinutes || 0),
    targetSlideCount: Number(payload.targetSlideCount || 0),
    mode,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    retentionHours,
    uploads: storedUploads.map((item) => ({
      name: item.originalName,
      mimeType: item.mimeType,
      size: item.size,
      relativePath: item.relativePath
    })),
    slides
  };

  await persistProjectManifest(projectDir, manifest);
  await renderProject(projectDir, manifest);
  return { project: summarizeProject(manifest), manifest };
}

async function handleCreateProject(req, res) {
  const payload = await parseJsonBody(req);
  const result = await createProjectFromPayload(payload);
  sendJson(res, 201, { project: result.project });
}

async function handleGetProject(res, projectId) {
  const manifest = await readProjectManifest(projectId);
  sendJson(res, 200, { project: summarizeProject(manifest) });
}

async function handleRegenerateSlide(req, res, projectId, slideId) {
  const payload = await parseJsonBody(req);
  const manifest = await readProjectManifest(projectId);
  const slide = manifest.slides.find((item) => item.id === slideId);
  if (!slide) {
    sendJson(res, 404, { error: "Slide not found." });
    return;
  }

  applySlideEdit(slide, payload.editPrompt || "");
  const projectDir = path.join(projectsDir, projectId);
  await renderSlide(projectDir, slide);
  await persistProjectManifest(projectDir, manifest);
  sendJson(res, 200, { project: summarizeProject(manifest) });
}

async function handleDownloadSlide(res, projectId, slideId, format) {
  const manifest = await readProjectManifest(projectId);
  const slide = manifest.slides.find((item) => item.id === slideId);
  if (!slide) {
    sendJson(res, 404, { error: "Slide not found." });
    return;
  }
  const map = {
    gif: slide.render.gifPath,
    mp4: slide.render.mp4Path,
    png: slide.render.previewPath,
    json: path.join("slides", `${slide.id}.json`)
  };
  const relative = map[format];
  if (!relative) {
    sendJson(res, 400, { error: "Unsupported slide format." });
    return;
  }
  const absolute = path.join(projectsDir, projectId, relative);
  sendFile(res, absolute, `slide-${String(slide.index).padStart(2, "0")}.${format}`);
}

async function handleDownloadDeck(res, projectId, format) {
  if (format === "package") {
    const manifest = await readProjectManifest(projectId);
    const packageFile = path.join(projectsDir, projectId, `${projectId}.kalpa-project.json`);
    await fsp.writeFile(packageFile, JSON.stringify(manifest, null, 2));
    sendFile(res, packageFile, `${safeSlug(manifest.projectTitle, "kalpa-deck")}.kalpa-project.json`);
    return;
  }
  if (!["gif", "mp4"].includes(format)) {
    sendJson(res, 400, { error: "Unsupported deck format." });
    return;
  }
  const zipPath = await buildDeckZip(projectId, format);
  sendFile(res, zipPath, `${projectId}-${format}-deck.zip`);
}

async function handleGeneratedAsset(res, pathname) {
  const assetPath = path.normalize(path.join(dataDir, pathname.replace(/^\/generated\//, "")));
  if (!assetPath.startsWith(dataDir)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }
  sendFile(res, assetPath);
}

function serveStatic(res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, requestedPath));
  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }
  sendFile(res, filePath);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }

    if (url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        retentionHours,
        templates: templateManifest.templates.length,
        animations: templateManifest.animations.length
      });
      return;
    }

    if (url.pathname === "/api/bootstrap") {
      sendJson(res, 200, {
        retentionHours,
        templateManifest,
        uploadModes: [
          "prompt",
          "url",
          "desktop-files",
          "rendered-slide-rebuild",
          "editable-package-reupload"
        ]
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/projects") {
      await handleCreateProject(req, res);
      return;
    }

    let match = routeMatch(url.pathname, "/api/projects/:projectId");
    if (req.method === "GET" && match) {
      await handleGetProject(res, match.projectId);
      return;
    }

    match = routeMatch(url.pathname, "/api/projects/:projectId/slides/:slideId/regenerate");
    if (req.method === "POST" && match) {
      await handleRegenerateSlide(req, res, match.projectId, match.slideId);
      return;
    }

    match = routeMatch(url.pathname, "/api/projects/:projectId/slides/:slideId/download");
    if (req.method === "GET" && match) {
      await handleDownloadSlide(res, match.projectId, match.slideId, url.searchParams.get("format"));
      return;
    }

    match = routeMatch(url.pathname, "/api/projects/:projectId/deck/download");
    if (req.method === "GET" && match) {
      await handleDownloadDeck(res, match.projectId, url.searchParams.get("format"));
      return;
    }

    if (url.pathname.startsWith("/generated/")) {
      await handleGeneratedAsset(res, url.pathname);
      return;
    }

    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "Unexpected server error."
    });
  }
});

ensureDirectories()
  .then(cleanupExpiredProjects)
  .catch((error) => {
    console.error("Startup error:", error);
  });

setInterval(() => {
  cleanupExpiredProjects().catch((error) => {
    console.error("Cleanup error:", error);
  });
}, cleanupIntervalMs);

module.exports = {
  buildDeckZip,
  createProjectFromPayload,
  cleanupExpiredProjects,
  summarizeProject,
  templateManifest
};

if (process.env.NO_LISTEN !== "1") {
  server.listen(port, host, () => {
    console.log(`Kalpa slideshow tool listening on http://${host}:${port}`);
  });
}
