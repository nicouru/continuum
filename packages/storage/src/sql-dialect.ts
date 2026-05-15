/** Maps better-sqlite `?` placeholders to sqlx `$1…$n` style used by Tauri SQL plugin. */
export function dollarizeQuestionMarks(sql: string): string {
  let index = 0
  return sql.replace(/\?/g, () => {
    index += 1
    return `$${index}`
  })
}
