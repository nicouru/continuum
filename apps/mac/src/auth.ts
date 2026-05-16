import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { load } from "@tauri-apps/plugin-store"

const AUTH_STORE_PATH = "continuum-auth.json"
const DEFAULT_DIARIO_BASE_URL = "https://ocurrencias.net"

export type DiarioAuthSession = {
  baseUrl: string
  expiresAt: string
  sessionCookie: string
  userEmail: string
}

type FetchResponse = {
  headers: {
    get(name: string): string | null
  }
  ok: boolean
  status: number
  text(): Promise<string>
}

type LoginInput = {
  baseUrl: string
  email: string
  password: string
}

export function getConfiguredDiarioBaseUrl() {
  return (
    import.meta.env.VITE_DIARIO_ADMIN_BASE_URL?.trim() || DEFAULT_DIARIO_BASE_URL
  )
}

export async function readDiarioAuthSession(): Promise<DiarioAuthSession | null> {
  const store = await load(AUTH_STORE_PATH)
  const session = await store.get<DiarioAuthSession>("session")

  if (!isUsableSession(session)) {
    await clearDiarioAuthSession()
    return null
  }

  return session
}

export async function saveDiarioAuthSession(session: DiarioAuthSession) {
  const store = await load(AUTH_STORE_PATH)
  await store.set("session", session)
  await store.save()
}

export async function clearDiarioAuthSession() {
  const store = await load(AUTH_STORE_PATH)
  await store.delete("session")
  await store.save()
}

export async function loginToDiario(input: LoginInput): Promise<DiarioAuthSession> {
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const origin = new URL(baseUrl).origin
  const response = await httpFetch(`${origin}/api/admin/v1/login`, {
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin,
      referer: `${origin}/admin`,
    },
    method: "POST",
  })
  const body = await readJsonOrText(response)

  if (!response.ok) {
    throw new Error(getApiErrorMessage(body, `Login fallido (${response.status}).`))
  }

  const sessionCookie = getSessionCookie(response.headers.get("set-cookie"))
  const data = isRecord(body) && isRecord(body.data) ? body.data : {}
  const user = isRecord(data.user) ? data.user : {}
  const userEmail = typeof user.email === "string" ? user.email : input.email
  const expiresAt =
    typeof data.expiresAt === "string" ? data.expiresAt : new Date(Date.now() + 3600000).toISOString()

  return {
    baseUrl: origin,
    expiresAt,
    sessionCookie,
    userEmail,
  }
}

export async function logoutFromDiario(session: DiarioAuthSession) {
  await httpFetch(`${session.baseUrl}/api/admin/v1/logout`, {
    body: "{}",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      cookie: session.sessionCookie,
      origin: session.baseUrl,
      referer: `${session.baseUrl}/admin`,
    },
    method: "POST",
  })
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim()
  const withProtocol =
    trimmed && !/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed

  try {
    return new URL(withProtocol || DEFAULT_DIARIO_BASE_URL).origin
  } catch {
    throw new Error("La URL de Diario no es valida.")
  }
}

function isUsableSession(value: unknown): value is DiarioAuthSession {
  if (!isRecord(value)) {
    return false
  }
  if (
    typeof value.baseUrl !== "string" ||
    typeof value.expiresAt !== "string" ||
    typeof value.sessionCookie !== "string" ||
    typeof value.userEmail !== "string"
  ) {
    return false
  }
  return Date.parse(value.expiresAt) > Date.now() + 60000
}

function getSessionCookie(header: string | null) {
  const cookie = header
    ?.split(/,(?=[^;,]+=)/)
    .map((part) => part.split(";")[0]?.trim())
    .find((part): part is string => Boolean(part && part.includes("=")))

  if (!cookie) {
    throw new Error("Diario no devolvio cookie de sesion.")
  }

  return cookie
}

async function readJsonOrText(response: FetchResponse) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function getApiErrorMessage(body: unknown, fallback: string) {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message
  }
  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const httpFetch = tauriFetch as unknown as (
  input: string,
  init?: {
    body?: string
    headers?: Record<string, string>
    method?: string
  },
) => Promise<FetchResponse>
