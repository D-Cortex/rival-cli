import fs from 'fs';
import path from 'path';
import type { FileInput } from './api.js';

const MIME_MAP: Record<string, string> = {
  py: 'text/x-python',
  js: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/x-typescript',
  tsx: 'text/x-typescript',
  json: 'application/json',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  sh: 'text/x-sh',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  css: 'text/css',
  lua: 'text/x-lua',
};

// Allowed extensions per runtime
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  'python:3.13': ['py', 'txt'],
  javascript: ['js'],
  lua: ['lua'],
};

function getMime(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? 'text/plain';
}

function getExt(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Validates that all files match the allowed extensions for a given runtime.
 * Throws with a clear message if any file is invalid.
 */
export function validateFilesForRuntime(filePaths: string[], runtime: string): void {
  const allowed = ALLOWED_EXTENSIONS[runtime];
  if (!allowed) return; // unknown runtime — skip validation

  const invalid = filePaths.filter((f) => !allowed.includes(getExt(f)));
  if (invalid.length > 0) {
    const allowedStr = allowed.map((e) => `.${e}`).join(', ');
    throw new Error(
      `Runtime "${runtime}" only allows ${allowedStr} files.\n` +
      `  Invalid: ${invalid.join(', ')}`
    );
  }
}

/**
 * Reads local files and converts them to the FileInput format
 * expected by the backend: { path, meta: { name, mime }, data }
 */
export function readFilesForUpload(
  filePaths: string[],
  rootDir: string = process.cwd()
): FileInput[] {
  return filePaths.map((filePath) => {
    const absPath = path.resolve(rootDir, filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }
    const content = fs.readFileSync(absPath, 'utf-8');
    const relativePath = path.relative(rootDir, absPath);
    const apiPath = '/' + relativePath.replace(/\\/g, '/');
    const name = path.basename(relativePath);

    return {
      path: apiPath,
      meta: { name, mime: getMime(name) },
      data: content,
    };
  });
}

export interface RivalProjectConfig {
  functionId?: string;
  orgSlug?: string;
  fnSlug?: string;
  version?: string;
  runtime?: string;
  files?: string[];
  digitalAssetId?: string;
}

export function loadProjectConfig(dir: string = process.cwd()): RivalProjectConfig | null {
  const configPath = path.join(dir, 'rival.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as RivalProjectConfig;
  } catch {
    throw new Error(`Failed to parse rival.json: ${configPath}`);
  }
}
