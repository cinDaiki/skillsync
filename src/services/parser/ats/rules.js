/**
 * src/services/parser/ats/rules.js
 * 
 * Defines individual scoring rules for the ATS engine.
 * Each rule returns { score, maxScore, passed, feedback }
 */

export const RULES = [
  // ── COMPLETENESS ─────────────────────────────────────────────────────────────
  {
    id: 'contact_email',
    category: 'completeness',
    maxScore: 10,
    evaluate: (resume) => {
      const hasEmail = !!resume.contact?.email?.normalized;
      return {
        score: hasEmail ? 10 : 0,
        passed: hasEmail,
        feedback: hasEmail ? null : 'Missing email address in contact section.'
      };
    }
  },
  {
    id: 'contact_phone',
    category: 'completeness',
    maxScore: 5,
    evaluate: (resume) => {
      const hasPhone = !!resume.contact?.phone?.normalized;
      return {
        score: hasPhone ? 5 : 0,
        passed: hasPhone,
        feedback: hasPhone ? null : 'Missing phone number in contact section.'
      };
    }
  },
  {
    id: 'contact_linkedin',
    category: 'completeness',
    maxScore: 5,
    evaluate: (resume) => {
      const hasLinkedIn = !!resume.contact?.linkedin?.normalized;
      return {
        score: hasLinkedIn ? 5 : 0,
        passed: hasLinkedIn,
        feedback: hasLinkedIn ? null : 'Adding a LinkedIn profile can improve recruiter discoverability.'
      };
    }
  },
  {
    id: 'summary_presence',
    category: 'completeness',
    maxScore: 10,
    evaluate: (resume) => {
      const hasSummary = !!resume.summary;
      return {
        score: hasSummary ? 10 : 0,
        passed: hasSummary,
        feedback: hasSummary ? null : 'Consider adding a professional summary to highlight your career objective.'
      };
    }
  },
  {
    id: 'education_presence',
    category: 'completeness',
    maxScore: 10,
    evaluate: (resume) => {
      const hasEdu = Array.isArray(resume.education) && resume.education.length > 0;
      return {
        score: hasEdu ? 10 : 0,
        passed: hasEdu,
        feedback: hasEdu ? null : 'Missing education history.'
      };
    }
  },
  {
    id: 'experience_presence',
    category: 'completeness',
    maxScore: 20,
    evaluate: (resume) => {
      const hasExp = Array.isArray(resume.experience) && resume.experience.length > 0;
      return {
        score: hasExp ? 20 : 0,
        passed: hasExp,
        feedback: hasExp ? null : 'No work experience found. Consider adding internships or relevant projects if entry-level.'
      };
    }
  },
  {
    id: 'skills_presence',
    category: 'completeness',
    maxScore: 10,
    evaluate: (resume, config) => {
      const skillCount = Array.isArray(resume.skills) ? resume.skills.length : 0;
      const target = config.targets.minSkills || 5;
      const passed = skillCount >= target;
      return {
        score: passed ? 10 : Math.round((skillCount / target) * 10),
        passed,
        feedback: passed ? null : `Found only ${skillCount} skills. Try to include at least ${target} relevant skills.`
      };
    }
  },

  // ── IMPACT ───────────────────────────────────────────────────────────────────
  {
    id: 'quantified_metrics',
    category: 'impact',
    maxScore: 20,
    evaluate: (resume, config) => {
      let totalBullets = 0;
      let quantifiedBullets = 0;
      const numberRegex = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|%)\b/i;

      const items = [...(resume.experience || []), ...(resume.projects || [])];
      items.forEach(item => {
        (item.responsibilities || []).forEach(bullet => {
          totalBullets++;
          if (numberRegex.test(bullet)) quantifiedBullets++;
        });
      });

      if (totalBullets === 0) return { score: 0, passed: false, feedback: 'No experience or project descriptions found to evaluate impact.' };

      const ratio = quantifiedBullets / totalBullets;
      const target = config.targets.quantifiedMetricsRatio || 0.3;
      const passed = ratio >= target;
      const score = Math.min(20, Math.round((ratio / target) * 20));

      return {
        score,
        passed,
        feedback: passed ? null : `Only ${Math.round(ratio * 100)}% of your descriptions use numbers or metrics. Try to quantify achievements (e.g., 'improved by 20%').`
      };
    }
  },
  {
    id: 'action_verbs',
    category: 'impact',
    maxScore: 10,
    evaluate: (resume) => {
      // Basic check: do bullets start with typical action verbs?
      // For a robust system we'd use a dictionary, but here's a lightweight heuristic:
      // Most strong verbs end in 'ed' (past tense) or common present verbs.
      const weakWords = ['worked', 'helped', 'assisted', 'responsible for', 'duties included'];
      let weakFound = 0;
      let totalBullets = 0;

      const items = [...(resume.experience || []), ...(resume.projects || [])];
      items.forEach(item => {
        (item.responsibilities || []).forEach(bullet => {
          totalBullets++;
          const lower = bullet.toLowerCase();
          if (weakWords.some(w => lower.startsWith(w) || lower.includes(` ${w} `))) {
            weakFound++;
          }
        });
      });

      if (totalBullets === 0) return { score: 0, passed: false, feedback: 'No bullets to evaluate for action verbs.' };

      const passed = weakFound === 0;
      const score = passed ? 10 : Math.max(0, 10 - (weakFound * 2));
      return {
        score,
        passed,
        feedback: passed ? null : `Found ${weakFound} instances of weak verbs (e.g., 'helped', 'responsible for'). Use strong action verbs like 'Led', 'Developed', or 'Managed'.`
      };
    }
  },

  // ── FORMATTING & LENGTH ──────────────────────────────────────────────────────
  {
    id: 'optimal_length',
    category: 'formatting',
    maxScore: 10,
    evaluate: (resume, config) => {
      const words = (resume._rawText || '').split(/\s+/).length;
      const min = config.targets.minWords || 200;
      const max = config.targets.maxWords || 1500;
      
      const isTooShort = words < min;
      const isTooLong = words > max;
      const passed = !isTooShort && !isTooLong;

      let feedback = null;
      if (isTooShort) feedback = `Resume is too short (${words} words). Aim for at least ${min} words.`;
      if (isTooLong) feedback = `Resume is too long (${words} words). Try to keep it concise, under ${max} words.`;

      return {
        score: passed ? 10 : 0,
        passed,
        feedback
      };
    }
  }
];
