/**
 * Consensus Detector
 *
 * Parses reviewer output to determine if consensus has been reached.
 * Extracts structured fields: AGREE, REASON, FINAL_ANSWER, FEEDBACK
 */

import type { ConsensusResult } from '../types/index.js';

/**
 * Parse reviewer output to detect consensus
 */
export function detectConsensus(reviewerOutput: string): ConsensusResult {
  const result: ConsensusResult = {
    agreed: false,
    reason: null,
    finalAnswer: null,
    feedback: null,
    confidence: 0,
    rawContent: reviewerOutput,
  };

  // 1. Try to extract AGREE field
  const agreeMatch = reviewerOutput.match(/AGREE:\s*(YES|NO)/i);
  if (agreeMatch) {
    result.agreed = agreeMatch[1].toUpperCase() === 'YES';
    result.confidence += 0.4;
  }

  // 2. Extract REASON field (multiline supported)
  const reasonMatch = reviewerOutput.match(
    /REASON:\s*([\s\S]*?)(?=\n(?:AGREE|FINAL_ANSWER|FEEDBACK):|$)/i
  );
  if (reasonMatch) {
    result.reason = cleanExtractedText(reasonMatch[1]);
    result.confidence += 0.2;
  }

  // 3. Extract FINAL_ANSWER field (multiline supported)
  const finalMatch = reviewerOutput.match(
    /FINAL_ANSWER:\s*([\s\S]*?)(?=\n(?:AGREE|REASON|FEEDBACK):|$)/i
  );
  if (finalMatch) {
    result.finalAnswer = cleanExtractedText(finalMatch[1]);
    result.confidence += 0.2;
  }

  // 4. Extract FEEDBACK field (for when not agreed)
  const feedbackMatch = reviewerOutput.match(
    /FEEDBACK:\s*([\s\S]*?)(?=\n(?:AGREE|REASON|FINAL_ANSWER):|$)/i
  );
  if (feedbackMatch) {
    result.feedback = cleanExtractedText(feedbackMatch[1]);
    result.confidence += 0.2;
  }

  // 5. If no explicit AGREE field, try semantic detection
  if (agreeMatch === null) {
    const semanticResult = detectSemanticAgreement(reviewerOutput);
    if (semanticResult !== null) {
      result.agreed = semanticResult;
      result.confidence = Math.max(0.3, result.confidence * 0.7); // Lower confidence for semantic
    }
  }

  return result;
}

/**
 * Semantic detection of agreement when explicit AGREE field is missing
 */
function detectSemanticAgreement(content: string): boolean | null {
  const lowerContent = content.toLowerCase();

  // Strong positive indicators
  const positivePatterns = [
    /\b(i\s+)?agree\b/i,
    /\bapproved?\b/i,
    /\blgtm\b/i,
    /\blooks?\s+good\b/i,
    /\bno\s+(issues?|problems?|concerns?)\b/i,
    /\baccept(ed|able)?\b/i,
    /\bperfect\b/i,
    /\bexcellent\b/i,
    /同意/,
    /通过/,
    /批准/,
    /没有问题/,
  ];

  // Strong negative indicators
  const negativePatterns = [
    /\bdisagree\b/i,
    /\breject(ed)?\b/i,
    /\bneed(s)?\s+(to\s+)?(change|modify|fix|update|revise)/i,
    /\bproblem(s)?\b/i,
    /\bissue(s)?\b/i,
    /\bconcern(s)?\b/i,
    /\bplease\s+(fix|change|modify|update)/i,
    /不同意/,
    /需要修改/,
    /存在问题/,
    /有以下问题/,
  ];

  const hasPositive = positivePatterns.some((p) => p.test(content));
  const hasNegative = negativePatterns.some((p) => p.test(content));

  // Only return a result if signals are clear
  if (hasPositive && !hasNegative) {
    return true;
  }
  if (hasNegative && !hasPositive) {
    return false;
  }

  // Ambiguous - cannot determine
  return null;
}

/**
 * Clean extracted text by trimming and removing excessive whitespace
 */
function cleanExtractedText(text: string): string {
  return text
    .trim()
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .replace(/^\s+/gm, '') // Remove leading whitespace from lines
    .trim();
}

/**
 * Format consensus result for display
 */
export function formatConsensusResult(result: ConsensusResult): string {
  const lines: string[] = [];

  lines.push(`Agreement: ${result.agreed ? 'YES' : 'NO'}`);
  lines.push(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);

  if (result.reason) {
    lines.push(`\nReason: ${result.reason}`);
  }

  if (result.finalAnswer) {
    lines.push(`\nFinal Answer:\n${result.finalAnswer}`);
  }

  if (result.feedback) {
    lines.push(`\nFeedback:\n${result.feedback}`);
  }

  return lines.join('\n');
}

/**
 * Check if consensus result indicates the debate should continue
 */
export function shouldContinueDebate(result: ConsensusResult): boolean {
  // Continue if not agreed
  if (!result.agreed) {
    return true;
  }

  // If agreed but no final answer, might need clarification
  if (result.agreed && !result.finalAnswer && result.confidence < 0.5) {
    return true;
  }

  return false;
}
