import { Platform } from "react-native";

import { getSupabase } from "@/lib/supabase-client";
import {
  handleApiDelete,
  handleApiGet,
  handleApiPost,
  handleApiPut,
  isNetlifyApiPath,
} from "@/services/api-handlers";

function getBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL.replace(/\/$/, "");
  }
  if (Platform.OS === "web") {
    return "";
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    return `https://${domain}`;
  }
  return "";
}

export const API_BASE = getBaseUrl();

async function netlifyFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  const session = await getSupabase().auth.getSession();
  if (session.data.session?.access_token) {
    headers.Authorization = `Bearer ${session.data.session.access_token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  if (isNetlifyApiPath(path)) {
    return netlifyFetch<T>(path);
  }
  return handleApiGet<T>(path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (isNetlifyApiPath(path)) {
    return netlifyFetch<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  return handleApiPost<T>(path, body);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  if (isNetlifyApiPath(path)) {
    return netlifyFetch<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  return handleApiPut<T>(path, body);
}

export async function apiDelete(path: string): Promise<void> {
  if (isNetlifyApiPath(path)) {
    await netlifyFetch(path, { method: "DELETE" });
    return;
  }
  return handleApiDelete(path);
}
