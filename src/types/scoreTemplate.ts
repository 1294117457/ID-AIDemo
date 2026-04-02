/**
 * 加分规则
 */
export interface TemplateRule {
  id: number
  ruleName: string
  ruleScore: number
  description?: string
}

/**
 * 加分模板
 */
export interface ScoreTemplate {
  id: number
  templateName: string
  templateType: string // CONDITION | TRANSFORM
  scoreType: number
  templateMaxScore?: number
  description?: string
  rules: TemplateRule[]
}