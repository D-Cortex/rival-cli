import fs from 'fs';
import os from 'os';
import path from 'path';

export interface RivalConfig {
  token?: string;
  refreshToken?: string;
  orgId?: string;
  apiUrl?: string;
  email?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.rival');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function readConfig(): RivalConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as RivalConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: RivalConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/** Patch only the token fields without touching the rest of the config. */
export function updateTokens(token: string, refreshToken?: string): void {
  const config = readConfig();
  config.token = token;
  if (refreshToken) config.refreshToken = refreshToken;
  writeConfig(config);
}

export function clearConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

export function requireToken(): string {
  const token = process.env.RIVAL_TOKEN || readConfig().token;
  if (!token) {
    throw new Error(
      'Not authenticated. Run `rival login` first or set RIVAL_TOKEN env var.'
    );
  }
  return token;
}

export function requireOrgId(): string {
  const orgId = process.env.RIVAL_ORG_ID || readConfig().orgId;
  if (!orgId) {
    throw new Error(
      'Org ID not set. Run `rival login` first or set RIVAL_ORG_ID env var.'
    );
  }
  return orgId;
}

export function getApiUrl(): string {
  return process.env.RIVAL_API_URL || readConfig().apiUrl || 'https://cortexone.rival.io';
}

export function switchOrg(orgId: string): void {
  const config = readConfig();
  config.orgId = orgId;
  writeConfig(config);
}
