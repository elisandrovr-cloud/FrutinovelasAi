"use client";

import type {
  ChapterDTO,
  ChapterScript,
  CharacterDTO,
  CreateNovelaInput,
  ExportDTO,
  NovelaDTO,
  NovelaSummaryDTO,
  UpdateCharacterInput,
  VoiceOptionDTO,
} from "@fruti/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Id anónimo por navegador para el historial (sustituible por Supabase Auth). */
function ownerId() {
  if (typeof window === "undefined") return "anonymous";
  let id = localStorage.getItem("fruti-owner");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("fruti-owner", id);
  }
  return id;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: { "x-owner-id": ownerId(), ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Error ${res.status}`, res.status);
  return data as T;
}

export const api = {
  listNovelas: () => request<NovelaSummaryDTO[]>("/novelas"),
  createNovela: (input: CreateNovelaInput) => request<{ id: string }>("/novelas", { method: "POST", json: input }),
  getNovela: (id: string) => request<NovelaDTO>(`/novelas/${id}`),
  updateNovela: (id: string, body: { title?: string; tagline?: string; subtitles?: boolean }) => request<NovelaDTO>(`/novelas/${id}`, { method: "PATCH", json: body }),
  deleteNovela: (id: string) => request<void>(`/novelas/${id}`, { method: "DELETE" }),
  regenerateScript: (id: string) => request(`/novelas/${id}/script`, { method: "POST", json: {} }),
  getChapter: (id: string, n: number) => request<ChapterDTO>(`/novelas/${id}/chapters/${n}`),
  saveChapterScript: (id: string, n: number, script: ChapterScript) => request<ChapterDTO>(`/novelas/${id}/chapters/${n}/script`, { method: "PUT", json: script }),
  regenerateChapterScript: (id: string, n: number, cascade: boolean) =>
    request(`/novelas/${id}/chapters/${n}/regenerate-script`, { method: "POST", json: { cascade } }),
  design: (id: string, characterIds?: string[]) => request(`/novelas/${id}/design`, { method: "POST", json: { characterIds } }),
  approveCharacter: (cid: string) => request<CharacterDTO>(`/characters/${cid}/approve`, { method: "POST", json: {} }),
  regenerateCharacter: (cid: string) => request(`/characters/${cid}/regenerate`, { method: "POST", json: {} }),
  updateCharacter: (cid: string, input: UpdateCharacterInput) => request<CharacterDTO>(`/characters/${cid}`, { method: "PATCH", json: input }),
  voices: () => request<VoiceOptionDTO[]>("/voices"),
  produce: (id: string, mode: "ALL" | "SINGLE", number?: number) => request(`/novelas/${id}/produce`, { method: "POST", json: { mode, number } }),
  pause: (id: string) => request(`/novelas/${id}/pause`, { method: "POST", json: {} }),
  exportNovela: (id: string, kind: ExportDTO["kind"]) => request<ExportDTO>(`/novelas/${id}/exports`, { method: "POST", json: { kind } }),
};
