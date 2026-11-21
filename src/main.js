import "./style.css";
import { basicSetup, EditorView } from "codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";

const $ = selector => document.querySelector(selector);
const editorHost = $("#editor");
const status = $("#fileStatus");
const consoleBody = $("#consoleBody");
let currentFile = "main.cpp";
let editor;
let activeRunId = null;
let pollTimer = null;
let currentTab = "input";
let filesCache = [];
let lastConsoleText = "";
let inputBuffer = "";

function setStatus(message) { status.textContent = message; }
function setConsoleState(message, kind = "idle") {
  const state = $("#consoleRunState");
  state.textContent = message;
  state.dataset.state = kind;
}
function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".console-tab").forEach(button =>
    button.classList.toggle("active", button.dataset.tab === tab));

  if (tab === "input") {
    consoleBody.innerHTML = '<textarea id="inputData" placeholder="Nhập dữ liệu đầu vào..." spellcheck="false"></textarea>';
    attachInputTextarea();
  } else {
    renderConsoleText(lastConsoleText || "Chưa có kết quả. Nhấn RUN để thực thi chương trình.");
  }
}
function attachInputTextarea() {
  const inputArea = $("#inputData");
  if (!inputArea) return;
  inputArea.value = inputBuffer;
  inputArea.addEventListener("input", () => { inputBuffer = inputArea.value; });
}
function getInput() {
  const inputArea = $("#inputData");
  if (inputArea) inputBuffer = inputArea.value;
  return inputBuffer;
}
function renderConsoleText(text) {
  lastConsoleText = text;
  consoleBody.innerHTML = '<pre class="console-message"></pre>';
  consoleBody.querySelector("pre").textContent = text;
  consoleBody.scrollTop = consoleBody.scrollHeight;
}
function formatRunResult(data) {
  const parts = [];
  const stdout = String(data.stdout || "").replace(/\s+$/, "");
  const stderr = String(data.stderr || "").replace(/\s+$/, "");
  const ran = Boolean(data.ran);
  const elapsedMs = ran ? (data.durationMs || 0) : (data.compileDurationMs || 0);
  const elapsedLabel = ran ? "execution time" : "compile time";

  if (stdout) parts.push(stdout);
  if (stderr) {
    if (parts.length) parts.push("");
    parts.push(stderr);
  }
  if (!stdout && !stderr) parts.push("Chương trình không in ra dữ liệu.");

  if (data.exitCode !== null && data.exitCode !== undefined) {
    parts.push("");
    if (typeof data.exitCode === "number" && data.exitCode >= 0) {
      parts.push(`Process returned ${data.exitCode} (0x${data.exitCode.toString(16)})    ${elapsedLabel} : ${(elapsedMs / 1000).toFixed(3)} s`);
    } else {
      parts.push(`Process returned ${data.exitCode}    ${elapsedLabel} : ${(elapsedMs / 1000).toFixed(3)} s`);
    }
  }
  if (data.timedOut) parts.push("", "[TIMEOUT] Chương trình đã bị dừng do vượt thời gian.");
  else if (data.exitCode === 0) parts.push("", "Press RUN to execute again.");
  else if (data.exitCode !== null && data.exitCode !== undefined) parts.push("", "Chương trình kết thúc với lỗi.");

  return parts.join("\n");
}
function showResult(data) {
  const resultText = formatRunResult(data);
  showTab("output");
  renderConsoleText(resultText);

  const successful = data.exitCode === 0 && !data.timedOut;
  setConsoleState(successful ? "Finished" : "Failed", successful ? "success" : "error");
  $("#consoleExitStatus").textContent = data.exitCode === null || data.exitCode === undefined
    ? "Không có mã thoát" : `Exit code: ${data.exitCode}`;
  const elapsedMs = data.ran ? (data.durationMs ?? 0) : (data.compileDurationMs ?? 0);
  $("#consoleFooter").textContent = `${data.ran ? "Execution" : "Compile"} · ${elapsedMs} ms`;
}
function showConsoleError(message) {
  showTab("output");
  renderConsoleText(String(message));
  setConsoleState("Error", "error");
  $("#consoleExitStatus").textContent = "Không thể chạy";
  $("#consoleFooter").textContent = "Compiler / Server";
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function saveFile(silent = false) {
  const content = editor.state.doc.toString();
  await api(`/api/files/${encodeURIComponent(currentFile)}`, {
    method: "PUT", body: JSON.stringify({ content })
  });
  setStatus(`C++17 · Đã lưu ${currentFile}`);
  if (!silent) toast("Đã lưu tệp.");
}
async function loadFiles() {
  const data = await api("/api/files");
  filesCache = data.files;
  renderFileList();
}
function renderFileList() {
  const list = $("#fileList");
  list.innerHTML = "";
  filesCache.forEach(file => {
    const button = document.createElement("button");
    button.className = "file-item";
    button.textContent = `${file.name} · ${formatSize(file.size)}`;
    button.onclick = () => openFile(file.name);
    list.append(button);
  });
}
function formatSize(bytes) { return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`; }
async function openFile(name) {
  try {
    const data = await api(`/api/files/${encodeURIComponent(name)}`);
    currentFile = data.name;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: data.content } });
    $(".file-name").textContent = `📄 ${currentFile}`;
    setStatus("C++17 · Đã mở");
    $("#fileDrawer").classList.remove("open");
  } catch (error) { toast(error.message); }
}
async function newFile() {
  const name = prompt("Tên tệp mới (ví dụ: bai1.cpp):", "bai1.cpp");
  if (!name) return;
  try {
    await api("/api/files", { method: "POST", body: JSON.stringify({ name, content: "" }) });
    await loadFiles(); await openFile(name);
  } catch (error) { toast(error.message); }
}
async function deleteCurrentFile() {
  if (!confirm(`Xóa ${currentFile}?`)) return;
  try {
    await api(`/api/files/${encodeURIComponent(currentFile)}`, { method: "DELETE" });
    currentFile = "main.cpp";
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: "" } });
    $(".file-name").textContent = "📄 main.cpp";
    await loadFiles();
  } catch (error) { toast(error.message); }
}
async function runCode() {
  // Capture stdin while the INPUT textarea is still mounted. Switching tabs replaces its DOM node.
  const input = getInput();
  try {
    await saveFile(true);
    showTab("output");
    renderConsoleText("Đang biên dịch bằng Clang...");
    setConsoleState("Compiling", "running");
    $("#consoleExitStatus").textContent = "Đang xử lý";
    $("#consoleFooter").textContent = "C++17 · Đang biên dịch";

    const started = await api("/api/run", {
      method: "POST",
      body: JSON.stringify({ filename: currentFile, code: editor.state.doc.toString(), input })
    });
    activeRunId = started.id;
    setStatus("Đang biên dịch / chạy...");
    pollRun(started.id);
  } catch (error) {
    activeRunId = null;
    showConsoleError(error.message);
    setStatus("Không thể chạy chương trình");
  }
}
async function pollRun(id) {
  clearTimeout(pollTimer);
  try {
    const data = await api(`/api/run/${id}`);
    if (data.status !== "finished") {
      if (currentTab === "output") {
        renderConsoleText(data.stage === "compile" ? "Đang biên dịch bằng Clang..." : "Đang chạy chương trình...");
      }
      setConsoleState(data.stage === "compile" ? "Compiling" : "Running", "running");
      $("#consoleFooter").textContent = data.stage === "compile" ? "C++17 · Đang biên dịch" : "C++17 · Đang thực thi";
      pollTimer = setTimeout(() => pollRun(id), 250);
      return;
    }
    activeRunId = null;
    setStatus(`Hoàn tất · ${data.durationMs ?? data.compileDurationMs ?? 0} ms`);
    showResult(data);
    loadFiles().catch(() => {});
  } catch (error) {
    activeRunId = null;
    showConsoleError(error.message);
  }
}
async function stopCode() {
  clearTimeout(pollTimer);
  if (!activeRunId) { toast("Không có tiến trình nào đang chạy."); return; }
  try {
    const runId = activeRunId;
    await api(`/api/run/${runId}/stop`, { method: "POST", body: "{}" });
    activeRunId = null;
    setStatus("Đã dừng chương trình");
    setConsoleState("Stopped", "error");
    showTab("output");
    renderConsoleText(`${lastConsoleText}\n\nĐã dừng theo yêu cầu.`.trim());
    $("#consoleExitStatus").textContent = "Đã dừng";
    toast("Đã yêu cầu dừng chương trình.");
  } catch (error) { showConsoleError(error.message); }
}
function insertShortcut(value) {
  const view = editor;
  const selection = view.state.selection.main;
  view.dispatch({ changes: { from: selection.from, to: selection.to, insert: value },
    selection: { anchor: selection.from + value.length } });
  view.focus();
}
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 2200);
}
function toggleDrawer() { $("#fileDrawer").classList.toggle("open"); }
function bind(selector, event, callback) { $(selector).addEventListener(event, callback); }

editor = new EditorView({
  doc: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n\n    cout << n * 2 << '\\n';\n\n    return 0;\n}`,
  extensions: [basicSetup, cpp(), oneDark, EditorView.lineWrapping],
  parent: editorHost
});

attachInputTextarea();
bind("#runButton", "click", runCode);
bind("#stopButton", "click", stopCode);
bind("#menuButton", "click", toggleDrawer);
bind("#closeDrawer", "click", toggleDrawer);
bind("#newFile", "click", newFile);
bind("#refreshFiles", "click", loadFiles);
bind("#deleteFile", "click", deleteCurrentFile);
bind("#saveButton", "click", () => saveFile().catch(error => toast(error.message)));
document.querySelectorAll(".console-tab").forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab)));
bind("#clearConsole", "click", () => {
  showTab("output");
  renderConsoleText("");
  setConsoleState("Sẵn sàng", "idle");
  $("#consoleExitStatus").textContent = "Đã xóa";
  toast("Đã xóa Console.");
});
bind("#copyConsole", "click", async () => {
  try { await navigator.clipboard.writeText(lastConsoleText); toast("Đã sao chép Console."); }
  catch { toast("Trình duyệt không cho phép sao chép tự động."); }
});
bind("#toggleConsole", "click", () => {
  const panel = $("#consolePanel");
  panel.classList.toggle("collapsed");
  $("#toggleConsole").textContent = panel.classList.contains("collapsed") ? "⌃" : "⌄";
});
document.querySelectorAll(".shortcut").forEach(button => button.addEventListener("click", () => insertShortcut(button.dataset.insert)));
loadFiles().catch(() => toast("Chưa kết nối server. Hãy khởi động Coding C++ trong Termux."));
fetch("/api/health").then(response => response.json()).then(data => {
  setStatus(data.ok ? `Clang · ${data.compiler}` : "Server chưa sẵn sàng");
}).catch(() => setStatus("Chưa kết nối Termux"));
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
