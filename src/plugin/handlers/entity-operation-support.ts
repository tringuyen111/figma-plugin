/// <reference types="@figma/plugin-typings" />
import { ErrorCode } from "../../shared/protocol.js";
import { PluginExecError } from "./execute-js.js";

export function isSceneNode(value: BaseNode | BaseStyle | Variable | VariableCollection): value is SceneNode {
  return "parent" in value && "remove" in value && "type" in value && value.type !== "PAGE" && value.type !== "DOCUMENT";
}

export function safeJson(value: unknown): unknown {
  try {
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

export function failure(code: ErrorCode, message: string, hint?: string): PluginExecError {
  return new PluginExecError({ code, message, ...(hint ? { hint } : {}) });
}
