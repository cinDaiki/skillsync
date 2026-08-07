/**
 * src/services/ai/embeddingProvider.js
 * 
 * Abstraction layer for semantic embedding generation.
 * Decouples the matching engine from specific embedding libraries/backends.
 */

import { generateEmbedding, buildResumeTextForEmbedding, buildJobTextForEmbedding } from './embeddingService.js';

export const EmbeddingProvider = {
  /**
   * Generates a numerical vector embedding for the given text.
   * 
   * @param {string} text 
   * @returns {Promise<number[]>} Embedding vector (usually 384 dimensions)
   */
  async generateEmbedding(text) {
    return generateEmbedding(text);
  },

  /**
   * Builds the semantic text string representation of a resume.
   * 
   * @param {object} analysis - Parsed resume result
   * @param {string} [rawText] - Optional fallback raw text
   * @returns {string}
   */
  buildResumeText(analysis, rawText = '') {
    return buildResumeTextForEmbedding(analysis, rawText);
  },

  /**
   * Builds the semantic text string representation of a job posting.
   * 
   * @param {object} job - Job post details
   * @returns {string}
   */
  buildJobText(job) {
    return buildJobTextForEmbedding(job);
  }
};

export default EmbeddingProvider;
