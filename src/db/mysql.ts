import mysql from 'mysql2/promise'
import type { ScoreTemplate } from '../types/scoreTemplate.js'

let pool: mysql.Pool | null = null

/** 仅在 .env 配置了 MYSQL_HOST 时才启用（独立测试模式） */
function getPool(): mysql.Pool | null {
  if (!process.env.MYSQL_HOST) return null
  if (!pool) {
    pool = mysql.createPool({
      host:     process.env.MYSQL_HOST,
      port:     Number(process.env.MYSQL_PORT ?? 3306),
      user:     process.env.MYSQL_USER ?? 'root',
      password: process.env.MYSQL_PASSWORD ?? '',
      database: process.env.MYSQL_DATABASE ?? 'iddata',
      waitForConnections: true,
      connectionLimit: 3,
    })
    console.log(`[mysql] pool created → ${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT ?? 3306}/${process.env.MYSQL_DATABASE}`)
  }
  return pool
}

/** 从 idbackend DB 读取所有激活的加分模板（含规则），用于独立测试 */
export async function fetchTemplatesFromDb(): Promise<ScoreTemplate[]> {
  const p = getPool()
  if (!p) return []

  try {
    const [templates] = await p.query<mysql.RowDataPacket[]>(
      `SELECT id, template_name, template_type, score_type, template_max_score
       FROM score_templates WHERE is_active = 1`
    )

    const result: ScoreTemplate[] = []
    for (const t of templates) {
      const [rules] = await p.query<mysql.RowDataPacket[]>(
        `SELECT id, rule_name, rule_score FROM score_template_rules WHERE template_id = ?`,
        [t['id']]
      )
      result.push({
        id:              t['id'],
        templateName:    t['template_name'],
        templateType:    t['template_type'],
        scoreType:       t['score_type'],
        templateMaxScore: t['template_max_score'],
        rules: (rules as mysql.RowDataPacket[]).map((r) => ({
          id:        r['id'],
          ruleName:  r['rule_name'],
          ruleScore: r['rule_score'],
        })),
      })
    }
    console.log(`[mysql] fetched ${result.length} templates from DB`)
    return result
  } catch (err) {
    console.error('[mysql] fetchTemplatesFromDb error:', err)
    return []
  }
}

export function isMysqlEnabled(): boolean {
  return !!process.env.MYSQL_HOST
}
