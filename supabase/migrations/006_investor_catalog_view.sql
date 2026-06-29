-- 006_investor_catalog_view.sql
-- Денормализованный view для каталога инвестора.
-- Показывает только approved проекты с данными из анкеты и AI-анализа.

CREATE OR REPLACE VIEW v_investor_catalog AS
SELECT
  p.id,
  p.name,
  p.created_at,
  p.updated_at,
  qs1.answers->>'industry'       AS industry,
  qs1.answers->>'stage'          AS stage,
  qs1.answers->>'country'        AS country,
  qs1.answers->>'city'           AS city,
  qs1.answers->>'description'    AS description,
  qs6.answers->>'investment_ask' AS investment_ask,
  qs6.answers->>'investment_type' AS investment_type,
  qs6.answers->>'valuation_pre_money' AS valuation_pre_money,
  CASE
    WHEN ar.status = 'done' THEN (ar.report->>'ai_score')::numeric
    ELSE NULL
  END AS ai_score,
  CASE
    WHEN ar.status = 'done' THEN ar.report->>'summary'
    ELSE NULL
  END AS ai_summary
FROM projects p
LEFT JOIN project_questionnaire qs1
  ON qs1.project_id = p.id AND qs1.section = 's1'
LEFT JOIN project_questionnaire qs6
  ON qs6.project_id = p.id AND qs6.section = 's6'
LEFT JOIN ai_reports ar
  ON ar.project_id = p.id
WHERE p.status = 'approved';

-- View не поддерживает RLS напрямую.
-- Доступ контролируется через API-роут (admin client).
-- В будущем можно добавить security_invoker=true.
