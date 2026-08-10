/**
 * microcredentialService.js
 * Controlled Microcredentials Recommendation Service for SkillSync.
 * Maps missing candidate skills to verified learning credentials from a controlled catalog.
 */

import { supabase } from './supabase.js';

/**
 * Curated Controlled Microcredential Catalog (Fallback when database catalog is unpopulated)
 */
export const CURATED_MICROCREDENTIALS = [
  {
    id: "mc-docker-01",
    title: "Docker & Container Fundamentals",
    provider: "Coursera",
    skill_name: "Docker",
    canonical_skill: "docker",
    level: "Beginner",
    duration: "4 weeks",
    description: "Learn containerization principles, Dockerfiles, volume mounts, and container orchestration.",
    credential_url: "https://www.coursera.org/learn/docker-fundamentals",
    badge: "🐳 Docker Certified"
  },
  {
    id: "mc-aws-01",
    title: "AWS Cloud Practitioner Essentials",
    provider: "AWS Training",
    skill_name: "AWS",
    canonical_skill: "aws",
    level: "Beginner",
    duration: "6 hours",
    description: "Master core AWS cloud concepts, security, IAM roles, EC2 instances, and S3 infrastructure.",
    credential_url: "https://aws.amazon.com/training/course-labs/aws-cloud-practitioner-essentials/",
    badge: "☁️ AWS Certified"
  },
  {
    id: "mc-postgres-01",
    title: "PostgreSQL Relational Database Administration",
    provider: "IBM",
    skill_name: "PostgreSQL",
    canonical_skill: "postgresql",
    level: "Intermediate",
    duration: "3 weeks",
    description: "Master SQL queries, database indexing, foreign key constraints, and performance tuning in Postgres.",
    credential_url: "https://www.coursera.org/learn/relational-database-administration",
    badge: "🐘 Postgres Specialist"
  },
  {
    id: "mc-react-01",
    title: "React Front-End Developer Certificate",
    provider: "Meta",
    skill_name: "React",
    canonical_skill: "react",
    level: "Beginner",
    duration: "5 weeks",
    description: "Build interactive component-driven Web applications using React hooks, state management, and modern JS.",
    credential_url: "https://www.coursera.org/professional-certificates/meta-front-end-developer",
    badge: "⚛️ React Professional"
  },
  {
    id: "mc-nodejs-01",
    title: "Node.js API & Backend Development",
    provider: "LinkedIn Learning",
    skill_name: "Node.js",
    canonical_skill: "node.js",
    level: "Intermediate",
    duration: "4 hours",
    description: "Design scalable RESTful APIs, asynchronous event loops, and middleware architectures in Node.js.",
    credential_url: "https://www.linkedin.com/learning/node-js-essential-training-2",
    badge: "🟢 Node.js Developer"
  },
  {
    id: "mc-python-01",
    title: "Python for Data Science & AI",
    provider: "IBM",
    skill_name: "Python",
    canonical_skill: "python",
    level: "Beginner",
    duration: "4 weeks",
    description: "Learn Python programming, pandas data structures, NumPy arrays, and core AI algorithms.",
    credential_url: "https://www.coursera.org/learn/python-for-applied-data-science-ai",
    badge: "🐍 Python Certified"
  },
  {
    id: "mc-js-01",
    title: "Modern JavaScript ES6+ Certification",
    provider: "freeCodeCamp",
    skill_name: "JavaScript",
    canonical_skill: "javascript",
    level: "Beginner",
    duration: "Self-paced",
    description: "Master ES6+ syntax, async/await promises, DOM manipulation, and functional programming.",
    credential_url: "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures-v8/",
    badge: "📜 JS Specialist"
  },
  {
    id: "mc-ts-01",
    title: "TypeScript Developer Fundamentals",
    provider: "Microsoft Learn",
    skill_name: "TypeScript",
    canonical_skill: "typescript",
    level: "Intermediate",
    duration: "5 hours",
    description: "Learn static typing, interface definitions, generics, and compiler configurations in TypeScript.",
    credential_url: "https://learn.microsoft.com/en-us/training/modules/typescript-get-started/",
    badge: "🟦 TypeScript Certified"
  },
  {
    id: "mc-ml-01",
    title: "Machine Learning Specialization",
    provider: "DeepLearning.AI",
    skill_name: "Machine Learning",
    canonical_skill: "machine learning",
    level: "Intermediate",
    duration: "6 weeks",
    description: "Learn supervised learning, linear regression, neural networks, and decision trees.",
    credential_url: "https://www.coursera.org/specializations/machine-learning-introduction",
    badge: "🤖 ML Professional"
  },
  {
    id: "mc-cyber-01",
    title: "Google Cybersecurity Professional Certificate",
    provider: "Google",
    skill_name: "Cybersecurity",
    canonical_skill: "cybersecurity",
    level: "Beginner",
    duration: "5 weeks",
    description: "Understand vulnerability assessments, network defense, encryption standards, and incident response.",
    credential_url: "https://www.coursera.org/professional-certificates/google-cybersecurity",
    badge: "🛡️ Security Specialist"
  },
  {
    id: "mc-git-01",
    title: "Version Control with Git & GitHub",
    provider: "Google",
    skill_name: "Git",
    canonical_skill: "git",
    level: "Beginner",
    duration: "2 weeks",
    description: "Master branch management, pull requests, merge conflict resolution, and collaborative workflows.",
    credential_url: "https://www.coursera.org/learn/introduction-git-github",
    badge: "🐙 Git Certified"
  },
  {
    id: "mc-pm-01",
    title: "Google Project Management Certificate",
    provider: "Google",
    skill_name: "Project Management",
    canonical_skill: "project management",
    level: "Beginner",
    duration: "6 weeks",
    description: "Learn Agile methodologies, project scoping, risk management, and stakeholder communication.",
    credential_url: "https://www.coursera.org/professional-certificates/google-project-management",
    badge: "📊 PMP Specialist"
  },
  {
    id: "mc-k8s-01",
    title: "Certified Kubernetes Application Developer (CKAD)",
    provider: "Linux Foundation",
    skill_name: "Kubernetes",
    canonical_skill: "kubernetes",
    level: "Advanced",
    duration: "Self-paced",
    description: "Design, build, configure, and expose cloud-native applications in Kubernetes clusters.",
    credential_url: "https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/",
    badge: "☸️ K8s Certified"
  },
  {
    id: "mc-cash-01",
    title: "Cashier & Retail POS Operations",
    provider: "LinkedIn Learning",
    skill_name: "Cash Handling",
    canonical_skill: "cash handling",
    level: "Beginner",
    duration: "2 hours",
    description: "Master register balancing, point-of-sale terminal transactions, and cash auditing procedures.",
    credential_url: "https://www.linkedin.com/learning/cash-register-and-pos-fundamentals",
    badge: "💵 Cashier Certified"
  },
  {
    id: "mc-food-01",
    title: "ServSafe Food Handler Certification",
    provider: "ServSafe",
    skill_name: "Food Safety",
    canonical_skill: "food safety",
    level: "Beginner",
    duration: "4 hours",
    description: "Understand food hygiene, cross-contamination prevention, temperature controls, and sanitation regulations.",
    credential_url: "https://www.servsafe.com/ServSafe-Food-Handler",
    badge: "🍽️ Food Safety Specialist"
  },
  {
    id: "mc-cs-01",
    title: "Customer Service Excellence & Communication",
    provider: "LinkedIn Learning",
    skill_name: "Customer Service",
    canonical_skill: "customer service",
    level: "Beginner",
    duration: "3 hours",
    description: "Develop conflict resolution techniques, active listening skills, and positive customer engagement.",
    credential_url: "https://www.linkedin.com/learning/customer-service-foundations",
    badge: "🤝 Customer Service Certified"
  }
];

/**
 * Normalizes skill strings to canonical lower-case forms for accurate catalog matching.
 * E.g., "Amazon Web Services" -> "aws", "React.js" -> "react", "Postgres" -> "postgresql"
 */
export function normalizeSkillForCatalog(skillName) {
  if (!skillName || typeof skillName !== 'string') return '';
  const s = skillName.trim().toLowerCase();

  // Common Aliases & Synonyms Mapping
  if (s === 'amazon web services' || s === 'aws s3' || s === 'aws ec2') return 'aws';
  if (s === 'react.js' || s === 'reactjs' || s === 'react native') return 'react';
  if (s === 'node' || s === 'nodejs' || s === 'node.js') return 'node.js';
  if (s === 'postgres' || s === 'postgresql' || s === 'psql') return 'postgresql';
  if (s === 'js' || s === 'javascript es6' || s === 'ecmascript') return 'javascript';
  if (s === 'ts' || s === 'typescript.js') return 'typescript';
  if (s === 'ml' || s === 'deep learning' || s === 'artificial intelligence' || s === 'ai') return 'machine learning';
  if (s === 'k8s') return 'kubernetes';
  if (s === 'qa' || s === 'quality assurance' || s === 'unit testing') return 'quality assurance';

  return s;
}

/**
 * Fetches the active controlled catalog from Supabase, or falls back to static curated catalog.
 * Cached in memory to ensure optimal performance without repeated network overhead.
 */
let cachedCatalog = null;

export async function getMicrocredentialsCatalog() {
  if (cachedCatalog) return cachedCatalog;

  try {
    const { data, error } = await supabase
      .from('microcredentials_catalog')
      .select('*')
      .eq('is_active', true);

    if (!error && Array.isArray(data) && data.length > 0) {
      cachedCatalog = data.map(item => ({
        id: item.id,
        title: item.title,
        provider: item.provider,
        skill_name: item.skill_name,
        canonical_skill: item.canonical_skill || item.skill_name.toLowerCase(),
        level: item.level || 'Beginner',
        duration: item.duration || 'Self-paced',
        description: item.description || '',
        credential_url: item.credential_url,
        badge: item.badge || `🎓 ${item.skill_name} Certificate`
      }));
      return cachedCatalog;
    }
  } catch (err) {
    console.warn('[Microcredentials] Supabase query fallback to curated catalog:', err?.message || err);
  }

  cachedCatalog = CURATED_MICROCREDENTIALS;
  return cachedCatalog;
}

/**
 * Synchronously or asynchronously maps missing candidate skills to matching controlled microcredentials.
 *
 * @param {string[]} missingSkills - Array of missing skill strings
 * @param {Array} [catalog=null] - Optional catalog array
 * @returns {Array<{ skill: string, title: string, provider: string, level: string, duration: string, description: string, url: string, badge: string }>}
 */
export function matchMicrocredentialsForMissingSkills(missingSkills = [], catalog = null) {
  if (!Array.isArray(missingSkills) || missingSkills.length === 0) return [];

  const activeCatalog = catalog && catalog.length > 0 ? catalog : CURATED_MICROCREDENTIALS;
  const recommended = [];
  const usedSkillKeys = new Set();
  const usedCredentialIds = new Set();

  for (const rawSkill of missingSkills) {
    if (!rawSkill || typeof rawSkill !== 'string') continue;
    const norm = normalizeSkillForCatalog(rawSkill);
    if (!norm || usedSkillKeys.has(norm)) continue;

    // Find matching active item in catalog with valid HTTPS URL
    const match = activeCatalog.find(item => {
      if (item.is_active === false) return false;
      const url = item.credential_url || item.url || item.link;
      if (!url || typeof url !== 'string' || !url.startsWith('https://')) return false;

      const catNorm = normalizeSkillForCatalog(item.canonical_skill || item.skill_name);
      return catNorm === norm || catNorm.includes(norm) || norm.includes(catNorm);
    });

    if (match && !usedCredentialIds.has(match.id || match.title)) {
      usedSkillKeys.add(norm);
      usedCredentialIds.add(match.id || match.title);
      recommended.push({
        id: match.id || `mc-${norm}`,
        skill: rawSkill,
        skill_name: match.skill_name || rawSkill,
        title: match.title,
        provider: match.provider,
        level: match.level || 'Beginner',
        duration: match.duration || 'Self-paced',
        description: match.description || '',
        url: match.credential_url || match.link || '#',
        badge: match.badge || `🎓 ${match.skill_name || rawSkill} Certificate`
      });

      if (recommended.length >= 4) break; // Limit to top 4 recommendations per job
    }
  }

  return recommended;
}
