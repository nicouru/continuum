import Database from "@tauri-apps/plugin-sql"
import {
  createAsyncSqlNoteRepository,
  migrateAsyncSql,
  type AsyncSqlDatabase,
} from "./note-repository/async-sql-note-repository"

function formatTauriError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  if (error && typeof error === "object") {
    const entries = Reflect.ownKeys(error)
      .map((key) => {
        const value = (error as Record<PropertyKey, unknown>)[key]
        return `${String(key)}=${String(value)}`
      })
      .join(", ")
    if (entries) {
      return entries
    }
  }
  return String(error)
}

export async function openContinuumRepository() {
  let raw: Database
  try {
    raw = await Database.load("sqlite:continuum.db")
  } catch (error) {
    throw new Error(`No se pudo cargar SQLite local: ${formatTauriError(error)}`)
  }
  const db: AsyncSqlDatabase = {
    execute: (sql, bind) => raw.execute(sql, bind),
    select: (sql, bind) => raw.select(sql, bind),
  }
  try {
    await migrateAsyncSql(db)
  } catch (error) {
    throw new Error(`No se pudo migrar SQLite local: ${formatTauriError(error)}`)
  }
  return createAsyncSqlNoteRepository(db)
}
