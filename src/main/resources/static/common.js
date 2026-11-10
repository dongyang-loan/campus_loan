"use strict";
const $ = (s) => document.querySelector(s);
const app = $("#app"),
  modal = $("#detail");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (v) =>
  String(v || "")
    .replace("T", " ")
    .slice(0, 16);
const pair = (k, v) =>
  '<div class="pair"><span>' +
  esc(k) +
  "</span><strong>" +
  esc(v) +
  "</strong></div>";
const btn = (text, fn, cl = "") =>
  '<button type="button" class="' +
  cl +
  '" onclick="' +
  fn +
  '">' +
  esc(text) +
  "</button>";
const check = (n, text, checked = false, required = false) =>
  '<label class="check"><input type="checkbox" name="' +
  n +
  '" ' +
  (checked ? "checked " : "") +
  (required ? "required" : "") +
  ">" +
  esc(text) +
  "</label>";
const opt = (v, t, selected = false) =>
  '<option value="' +
  esc(v) +
  '" ' +
  (selected ? "selected" : "") +
  ">" +
  esc(t) +
  "</option>";
function popup(html) {
  modal.innerHTML =
    '<button class="close" aria-label="닫기" onclick="modal.close()">×</button>' +
    html +
    '<p class="error" role="alert" id="modalError"></p>';
  if (!modal.open) modal.showModal();
}
function notice(msg) {
  $("#notice").textContent = msg;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => ($("#notice").textContent = ""), 4500);
}
async function api(path, body) {
  const options = body
    ? {
        method: "POST",
        headers: { "X-CSRF-TOKEN": $("meta[name=csrf]").content },
        body: path === "admin/catalog" ? body : new URLSearchParams(body),
      }
    : {};
  const r = await fetch("/api/" + path, { cache: "no-store", ...options });
  if (r.redirected && r.url.includes("/login")) {
    location.href = "/login";
    throw Error("다시 로그인해 주세요.");
  }
  if (!r.ok) {
    const error = await r.json().catch(() => ({}));
    throw Error(
      error.message || "요청을 처리하지 못했습니다. 새로고침 후 확인해 주세요.",
    );
  }
  return r.headers.get("content-type")?.includes("json") ? r.json() : null;
}
function report(e) {
  if (modal?.open && $("#modalError")) $("#modalError").textContent = e.message;
  else notice(e.message);
}
const field = (name, label, value = "", type = "text", extra = "") =>
  "<label>" +
  esc(label) +
  '<input type="' +
  type +
  '" name="' +
  name +
  '" value="' +
  esc(value) +
  '" ' +
  extra +
  "></label>";
const select = (name, label, options) =>
  "<label>" +
  esc(label) +
  '<select required name="' +
  name +
  '">' +
  options +
  "</select></label>";
