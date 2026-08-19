import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const templateUrl = new URL("../src/ui/template.html", import.meta.url);
const stylesUrl = new URL("../src/ui/styles.css", import.meta.url);
const scriptDirUrl = new URL("../src/ui/script/", import.meta.url);
const outputUrl = new URL("../plugin/ui.html", import.meta.url);

export function readUiScript() {
  const names = readdirSync(scriptDirUrl)
    .filter((name) => name.endsWith(".js"))
    .sort();
  if (names.length === 0) throw new Error("No ControlMux UI script parts found.");
  return names.map((name) => readFileSync(new URL(name, scriptDirUrl), "utf8")).join("");
}

export function buildUi() {
  const template = readFileSync(templateUrl, "utf8");
  const styles = readFileSync(stylesUrl, "utf8");
  const script = readUiScript();
  const html = template
    .replace("{{CONTROLMUX_STYLES}}", styles)
    .replace("{{CONTROLMUX_SCRIPT}}", script);
  if (html.includes("{{CONTROLMUX_")) throw new Error("Unresolved ControlMux UI build placeholder.");
  writeFileSync(outputUrl, html, "utf8");
  return fileURLToPath(outputUrl);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`built ${buildUi()}`);
}
