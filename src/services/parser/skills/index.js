/**
 * skills/index.js — Skill dictionary aggregator
 *
 * Imports all category files and builds two data structures at module load time:
 *   SKILL_MAP  — Map<string, SkillEntry>  (canonical + aliases, all lowercase keys)
 *   ALL_SKILLS — SkillEntry[]             (flat array for fuzzy search iteration)
 *
 * O(1) lookup for exact/alias matching; ALL_SKILLS used for fuzzy pass.
 * Each category is a separate file — add new ones by importing here only.
 *
 * @typedef {{
 *   canonical: string,
 *   category:  string,
 *   weight:    number,
 *   aliases:   string[]
 * }} SkillEntry
 */

import frontend       from './frontend.js'
import backend        from './backend.js'
import mobile         from './mobile.js'
import database       from './database.js'
import cloud          from './cloud.js'
import devops         from './devops.js'
import aiMl           from './ai-ml.js'
import data           from './data.js'
import security       from './security.js'
import qaTesting      from './qa-testing.js'
import tools          from './tools.js'
import businessFinance from './business-finance.js'
import healthcare     from './healthcare.js'
import educationSkills from './education-skills.js'
import marketing      from './marketing.js'
import engineering    from './engineering.js'
import hrAdmin        from './hr-admin.js'
import softSkills     from './soft-skills.js'
import office         from './office.js'

// Merge all categories
export const ALL_SKILLS = [
  ...frontend, ...backend, ...mobile, ...database,
  ...cloud, ...devops, ...aiMl, ...data,
  ...security, ...qaTesting, ...tools, ...businessFinance,
  ...healthcare, ...educationSkills, ...marketing, ...engineering,
  ...hrAdmin, ...softSkills, ...office,
]

/**
 * Build O(1) lookup map.
 * Key: lowercase canonical or alias
 * Value: the SkillEntry (pointing to canonical form)
 */
export const SKILL_MAP = new Map()

ALL_SKILLS.forEach(skill => {
  // Index canonical form
  SKILL_MAP.set(skill.canonical.toLowerCase(), skill)

  // Index all aliases
  if (skill.aliases) {
    skill.aliases.forEach(alias => {
      const key = alias.toLowerCase()
      if (!SKILL_MAP.has(key)) {   // don't overwrite canonical if alias collides
        SKILL_MAP.set(key, skill)
      }
    })
  }
})

/**
 * Quick lookup: given a raw token, find the canonical SkillEntry.
 * Returns null if not found (caller should try fuzzy next).
 *
 * @param {string} token
 * @returns {SkillEntry|null}
 */
export function lookupSkill(token) {
  return SKILL_MAP.get(token.toLowerCase()) ?? null
}

/**
 * Summary stats (useful for debugging / version info)
 */
export const DICTIONARY_STATS = {
  totalEntries:  ALL_SKILLS.length,
  totalLookups:  SKILL_MAP.size,
  categories:    [...new Set(ALL_SKILLS.map(s => s.category))],
}
