const state = {
  bootstrap: null,
  project: null,
  files: []
};

const form = document.getElementById("projectForm");
const fileInput = document.getElementById("fileInput");
const selectedFiles = document.getElementById("selectedFiles");
const bootstrapMeta = document.getElementById("bootstrapMeta");
const projectSection = document.getElementById("projectSection");
const projectTitle = document.getElementById("projectTitle");
const projectMeta = document.getElementById("projectMeta");
const slideGrid = document.getElementById("slideGrid");
const deckActions = document.getElementById("deckActions");
const slideTemplate = document.getElementById("slideCardTemplate");

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function formatExpiry(value) {
  const expiresAt = new Date(value);
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m remaining`;
}

function renderBootstrapMeta() {
  if (!state.bootstrap) return;
  const { retentionHours, templateManifest, uploadModes } = state.bootstrap;
  bootstrapMeta.innerHTML = `
    <li><strong>${templateManifest.templates.length}</strong> starter templates loaded</li>
    <li><strong>${templateManifest.animations.length}</strong> low-cost animation presets</li>
    <li><strong>${retentionHours} hours</strong> server-side retention</li>
    <li>${uploadModes.join(", ")}</li>
  `;
}

function renderSelectedFiles() {
  if (!state.files.length) {
    selectedFiles.classList.add("empty");
    selectedFiles.textContent = "No files selected yet.";
    return;
  }

  selectedFiles.classList.remove("empty");
  const items = state.files
    .map((file) => `<li>${file.name} <small>(${Math.round(file.size / 1024)} KB)</small></li>`)
    .join("");
  selectedFiles.innerHTML = `<ul>${items}</ul>`;
}

function setDeckActionLinks(project) {
  Array.from(deckActions.querySelectorAll("[data-deck-format]")).forEach((button) => {
    button.onclick = () => {
      const format = button.getAttribute("data-deck-format");
      window.location.href = `/api/projects/${project.id}/deck/download?format=${encodeURIComponent(format)}`;
    };
  });
}

function renderProject(project) {
  state.project = project;
  projectSection.classList.remove("hidden");
  projectTitle.textContent = project.projectTitle || "Current deck";
  projectMeta.textContent = `${project.slides.length} slides • ${project.mode} • ${formatExpiry(project.expiresAt)}`;
  setDeckActionLinks(project);
  slideGrid.innerHTML = "";

  project.slides.forEach((slide) => {
    const node = slideTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("img").src = `/generated/projects/${project.id}/${slide.previewPath}?v=${slide.version}`;
    node.querySelector("img").alt = slide.title;
    node.querySelector(".slide-card__index").textContent = `Slide ${String(slide.index).padStart(2, "0")}`;
    node.querySelector(".slide-card__title").textContent = slide.title;
    node.querySelector(".slide-card__template").textContent = slide.templateId;
    node.querySelector(".slide-card__subtitle").textContent = slide.subtitle || "No subtitle yet.";

    const textarea = node.querySelector(".slide-edit-prompt");
    textarea.value = slide.notes || "";

    node.querySelector(".slide-regenerate").onclick = async () => {
      const button = node.querySelector(".slide-regenerate");
      button.disabled = true;
      button.textContent = "Rendering...";
      try {
        const payload = await fetchJson(`/api/projects/${project.id}/slides/${slide.id}/regenerate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editPrompt: textarea.value })
        });
        renderProject(payload.project);
      } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "Regenerate slide";
      }
    };

    node.querySelector(".slide-download-gif").href =
      `/api/projects/${project.id}/slides/${slide.id}/download?format=gif`;
    node.querySelector(".slide-download-mp4").href =
      `/api/projects/${project.id}/slides/${slide.id}/download?format=mp4`;
    node.querySelector(".slide-download-png").href =
      `/api/projects/${project.id}/slides/${slide.id}/download?format=png`;

    slideGrid.appendChild(node);
  });
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

async function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Generating...";

  try {
    const uploads = await Promise.all(
      state.files.map(async (file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        base64: await fileToBase64(file)
      }))
    );

    const payload = await fetchJson("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectTitle: formData.get("projectTitle"),
        prompt: formData.get("prompt"),
        sourceUrl: formData.get("sourceUrl"),
        desiredMinutes: formData.get("desiredMinutes"),
        targetSlideCount: formData.get("targetSlideCount"),
        uploads
      })
    });

    renderProject(payload.project);
    projectSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Generate MVP deck";
  }
}

async function bootstrap() {
  try {
    const payload = await fetchJson("/api/bootstrap");
    state.bootstrap = payload;
    renderBootstrapMeta();
  } catch (error) {
    bootstrapMeta.innerHTML = `<li>${error.message}</li>`;
  }
}

fileInput.addEventListener("change", (event) => {
  state.files = Array.from(event.target.files || []);
  renderSelectedFiles();
});

form.addEventListener("submit", handleSubmit);

bootstrap();
