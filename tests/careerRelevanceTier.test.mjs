import assert from "assert";
import { getCareerRelevanceTier, CAREER_RELEVANCE_TIERS } from "../src/services/careerRelevanceService.js";

console.log("=== RUNNING CAREER RELEVANCE TIER BOUNDARY TESTS ===");

const testCases = [
  { score: 100, expectedKey: "Highly Related", expectedLabel: "Highly Related" },
  { score: 80,  expectedKey: "Highly Related", expectedLabel: "Highly Related" },
  { score: 79,  expectedKey: "Related",        expectedLabel: "Related" },
  { score: 60,  expectedKey: "Related",        expectedLabel: "Related" },
  { score: 59,  expectedKey: "Adjacent",       expectedLabel: "Adjacent" },
  { score: 40,  expectedKey: "Adjacent",       expectedLabel: "Adjacent" },
  { score: 39,  expectedKey: "Outside Primary Field", expectedLabel: "Outside Primary Field" },
  { score: 0,   expectedKey: "Outside Primary Field", expectedLabel: "Outside Primary Field" },
];

let passed = 0;
for (const tc of testCases) {
  const result = getCareerRelevanceTier(tc.score);
  assert.strictEqual(
    result.key,
    tc.expectedKey,
    `Score ${tc.score}: expected key '${tc.expectedKey}', got '${result.key}'`
  );
  assert.strictEqual(
    result.label,
    tc.expectedLabel,
    `Score ${tc.score}: expected label '${tc.expectedLabel}', got '${result.label}'`
  );
  console.log(`✓ Score ${String(tc.score).padStart(3, " ")} -> ${result.label} (${result.icon})`);
  passed++;
}

console.log(`\nAll ${passed} tier boundary tests PASSED!`);
