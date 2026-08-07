/**
 * p08-skillRecognizer.js
 * Phase 3 — Context-aware skill recognition engine (P08).
 *
 * Scans structured resume context across multiple sections, applies dictionary
 * and fuzzy matching, deduplicates results, and produces weighted confidence scores.
 */

import { SKILL_RECOGNITION_CONFIG } from '../config/configLoader.js'
import { collectSourceBlocks } from '../recognition/sourceCollector.js'
import { findSkillsInText } from '../recognition/skillMatcher.js'
import { aggregateSkillHits, toLegacySkillShape } from '../recognition/skillAggregator.js'

/**
 * Recognize skills from plain text (legacy API — treats text as Skills section).
 *
 * @param {string} text
 * @param {object} [config]
 * @returns {object[]}
 */
export function recognizeSkillsFromText(text, config = SKILL_RECOGNITION_CONFIG) {
  if (!text?.trim()) return []

  const hits = findSkillsInText(text, 'Skills', config)
  const aggregated = aggregateSkillHits(hits, config)
  return aggregated.map(toLegacySkillShape)
}

/**
 * Recognize skills from full pipeline context with source-aware weighting.
 *
 * @param {object} ctx
 * @param {object} [config]
 * @returns {object} ctx with skills[] and enriched projects
 */
export function recognizeSkills(ctx, config = SKILL_RECOGNITION_CONFIG) {
  const blocks = collectSourceBlocks(ctx)
  const allHits = []

  for (const block of blocks) {
    allHits.push(...findSkillsInText(block.text, block.source, config))
  }

  const aggregated = aggregateSkillHits(allHits, config)
  const skills = aggregated.map(toLegacySkillShape)

  let projects = ctx.projects
  if (Array.isArray(ctx.projects) && ctx.projects.length > 0) {
    projects = ctx.projects.map(project => {
      const description = project.description?.normalized || project.description?.raw || ''
      const name = project.name?.normalized || project.name?.raw || ''
      const projectText = [name, description, ...(project.responsibilities || [])].filter(Boolean).join('\n')
      if (!projectText.trim()) return project

      const projectHits = findSkillsInText(projectText, 'Projects', config)
      const projectSkills = aggregateSkillHits(projectHits, config).map(toLegacySkillShape)

      return {
        ...project,
        techStack: projectSkills,
      }
    })
  }

  return {
    ...ctx,
    skills,
    projects,
    skillRecognition: {
      version: config.version,
      blockCount: blocks.length,
      rawHitCount: allHits.length,
      uniqueSkills: skills.length,
    },
  }
}
