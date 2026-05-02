import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { readConfig, updateTokens } from './config.js';

const DESCOPE_API_URL = 'https://api.descope.com';

export interface FileInput {
  path: string;
  meta: {
    name: string;
    mime: string;
  };
  data: string;
}

export interface SaveCodePayload {
  files: FileInput[];
  version: string;
  digital_asset_id?: string | null;
}

export interface DescopeVerifyResponse {
  sessionJwt?: string;
  refreshJwt?: string;
  token?: string;
  sessionToken?: string;
  user?: {
    email?: string;
    name?: string;
  };
  [key: string]: unknown;
}

/** Descope OTP client — talks directly to api.descope.com */
export class DescopeClient {
  private client: AxiosInstance;

  constructor(projectId: string) {
    this.client = axios.create({
      baseURL: DESCOPE_API_URL,
      headers: {
        'Content-Type': 'application/json',
        // Descope public API uses the project ID as the Bearer token
        Authorization: `Bearer ${projectId}`,
      },
    });
  }

  async sendOtp(email: string): Promise<void> {
    await this.client.post('/v1/auth/otp/signin/email', { loginId: email });
  }

  async verifyOtp(email: string, code: string): Promise<DescopeVerifyResponse> {
    const res = await this.client.post<DescopeVerifyResponse>(
      '/v1/auth/otp/verify/email',
      { loginId: email, code }
    );
    return res.data;
  }

  async refreshSession(refreshJwt: string): Promise<{ sessionJwt: string; refreshJwt?: string }> {
    const res = await this.client.post<any>('/v1/auth/refresh', {}, {
      headers: { Cookie: `DSR=${refreshJwt}` },
    });
    return res.data;
  }
}

export interface Organization {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: string;
}

export interface MeResponse {
  success: boolean;
  data: {
    user_id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    organizations: Organization[];
    current_org_id?: string;
  };
}

export interface Metadata {
  categories: { category_id: string; name: string }[];
  sectors: { sector_id: string; name: string }[];
  compute_type: { name: string; display_name: string; default: boolean }[];
  type: { name: string; display_name: string; default: boolean }[];
  runtimes: { name: string; display_name: string; default: boolean }[];
  tags: { tag_id: string; name: string }[];
}

const DESCOPE_PROJECT_ID = process.env.DESCOPE_PROJECT_ID;

/** Rival backend API client */
export class RivalApiClient {
  private client: AxiosInstance;

  constructor(baseUrl: string, token?: string, orgId?: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(orgId ? { 'X-Organization-ID': orgId } : {}),
      },
    });

    // Auto-refresh on 401
    this.client.interceptors.response.use(
      (res) => res,
      async (error) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
        if (error.response?.status !== 401 || originalRequest._retried) {
          return Promise.reject(error);
        }

        const config = readConfig();
        const refreshJwt = config.refreshToken;
        if (!refreshJwt) return Promise.reject(error);

        try {
          originalRequest._retried = true;
          if (!DESCOPE_PROJECT_ID) return Promise.reject(error);
          const descope = new DescopeClient(DESCOPE_PROJECT_ID);
          const refreshed = await descope.refreshSession(refreshJwt);
          const newToken = refreshed.sessionJwt;

          // Persist new tokens
          updateTokens(newToken, refreshed.refreshJwt);

          // Retry original request with new token
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return this.client(originalRequest);
        } catch {
          return Promise.reject(error);
        }
      }
    );
  }

  async getMetadata(): Promise<Metadata> {
    const res = await this.client.get<any>('/api/v1/function/public/metadata');
    // Handle both { data: { categories, ... } } and { categories, ... } shapes
    const body = res.data?.data ?? res.data ?? {};
    return body as Metadata;
  }

  async getFunctions(): Promise<Array<{
    function_id: string;
    function_name: string;
    function_slug: string;
    short_description: string;
    type: string;
    visibility: string;
    versions: Array<{ version: string; runtime: string; state: string }>;
  }>> {
    const res = await this.client.get<any>('/api/v1/functions/summary');
    const body = res.data?.data ?? res.data;
    return Array.isArray(body) ? body : (body?.functions ?? body?.data ?? []);
  }

  async getVersions(orgSlug: string, fnSlug: string): Promise<Array<{
    version: string;
    state: string;
    runtime: string;
    files: Array<{ path: string; meta: { name: string; mime: string }; data: string }>;
  }>> {
    const res = await this.client.get<any>(
      `/api/v1/function/${encodeURIComponent(orgSlug)}/${encodeURIComponent(fnSlug)}/details`
    );
    return res.data?.data?.versions ?? [];
  }

  async getMe(): Promise<MeResponse> {
    const res = await this.client.get<MeResponse>('/api/v1/users/me');
    return res.data;
  }

  async createFunction(payload: {
    function_name: string;
    short_description: string;
    runtime: string;
    type: string;
    compute_type: string;
    category_ids: string;
    sector_ids: string;
    tag_ids?: string;
  }): Promise<{
    success: boolean;
    data: {
      function: {
        function_id: string;
        versions: Array<{
          files: Array<{ path: string; meta: { name: string; mime: string }; data: string }>;
        }>;
      };
      function_slug: string;
      organization_slug: string;
    };
  }> {
    // Backend expects multipart/form-data
    const form = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined) form.append(k, v);
    });

    const res = await this.client.post('/api/v1/functions', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  async saveCode(functionId: string, payload: SaveCodePayload): Promise<unknown> {
    const res = await this.client.put(
      `/api/v1/functions/${functionId}/save-version`,
      payload
    );
    return res.data;
  }

  async updateFunctionDetails(orgSlug: string, fnSlug: string, payload: {
    function_id: string;
    function_name?: string;
    short_description?: string;
    category_ids?: string[];
    tag_ids?: string[];
    sector_ids?: string[];
    long_description?: string;
  }): Promise<unknown> {
    const res = await this.client.put(
      `/api/v1/function/${encodeURIComponent(orgSlug)}/${encodeURIComponent(fnSlug)}/details`,
      { fnSlug, orgSlug, ...payload }
    );
    return res.data;
  }

  async getFunctionVisibility(orgSlug: string, fnSlug: string): Promise<string> {
    const res = await this.client.get<any>(
      `/api/v1/function/${encodeURIComponent(orgSlug)}/${encodeURIComponent(fnSlug)}/details`
    );
    return res.data?.data?.visibility ?? res.data?.data?.function?.visibility ?? 'private';
  }

  async createEvent(payload: {
    function_id: string;
    event_name: string;
    version: string;
    event_id?: string;
    event_data?: Record<string, unknown>;
  }): Promise<unknown> {
    const res = await this.client.post('/api/v1/events', payload);
    return res.data;
  }

  async createEventsBulk(events: Array<{
    function_id: string;
    event_name: string;
    version: string;
    event_data?: Record<string, unknown>;
  }>): Promise<unknown> {
    const res = await this.client.post('/api/v1/events/bulk', { events });
    return res.data;
  }

  async getEvents(orgSlug: string, fnSlug: string): Promise<unknown> {
    const res = await this.client.get(
      `/api/v1/functions/${encodeURIComponent(orgSlug)}/${encodeURIComponent(fnSlug)}/events`
    );
    return res.data;
  }

  async updateEvent(eventId: string, payload: {
    event_name?: string;
    event_data?: Record<string, unknown>;
    version?: string;
  }): Promise<unknown> {
    const res = await this.client.put(`/api/v1/events/${eventId}`, payload);
    return res.data;
  }
}
