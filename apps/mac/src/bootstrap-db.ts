import Database from "@tauri-apps/plugin-sql"
import {
  createAsyncSqlNoteRepository,
  migrateAsyncSql,
  type AsyncSqlDatabase,
} from "./note-repository/async-sql-note-repository"

export async function openContinuumRepository() {
  const raw = await Database.load("sqlite:continuum.db")
  const db: AsyncSqlDatabase = {
    execute: (sql, bind) => raw.execute(sql, bind),
    select: (sql, bind) => raw.select(sql, bind),
  }
  await migrateAsyncSql(db)
  return createAsyncSqlNoteRepository(db)
}
