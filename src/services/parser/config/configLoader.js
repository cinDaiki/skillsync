/**
 * configLoader.js
 * ---------------
 * Re-exports all parser config data from JS module files.
 *
 * Why JS instead of JSON:
 *   - Vite (browser bundler): handles `export default {...}` natively
 *   - Node native ESM: handles `export default {...}` natively
 *   - No `with { type: 'json' }` import attributes needed
 *   - No `fs.readFileSync` (which breaks in the browser)
 *
 * The source-of-truth files are still the `.json` files.
 * The `.js` wrappers are generated from them and should not be edited manually.
 *
 * Usage:
 *   import { SECTION_ALIASES, DEGREE_MAP, PARSER_CONFIG } from '../config/configLoader.js'
 */

export { default as SECTION_ALIASES } from './sectionAliases.js'
export { default as DEGREE_MAP }       from './degreeMap.js'
export { default as PARSER_CONFIG }    from './parserConfig.js'
export { default as SKILL_RECOGNITION_CONFIG } from './skillRecognitionConfig.js'
