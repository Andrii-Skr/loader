import { canonicalizeIssueNumber } from "@/lib/pdf/parser";

type ParsedIssueParts = {
  primary: string;
  fraction: string | null;
  year: string | null;
  label: string | null;
};

const PUNCTUATION_PATTERN = /[.,/\\()[\]{}"'`:+*?!_-]+/g;
const BRACKETED_R_MARKER_PATTERN = /\(\s*[rр]\s*\)/giu;
const REPEATED_LETTER_PATTERN = /(\p{L})\1+/gu;

const normalizeBracketedRMarker = (value: string) =>
  value.replace(BRACKETED_R_MARKER_PATTERN, " (r) ");

export const normalizeMatchingText = (value: string) =>
  normalizeBracketedRMarker(value.toLocaleLowerCase("uk-UA"))
    .replace(PUNCTUATION_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenizeMatchingText = (value: string) =>
  normalizeMatchingText(value)
    .split(" ")
    .filter((token) => token.length > 0);

const normalizeLooseMatchingText = (value: string) =>
  normalizeMatchingText(value).replace(REPEATED_LETTER_PATTERN, "$1");

export const normalizeIssueLookupText = (value: string, documentDate?: string) => {
  const normalized = normalizeMatchingText(value);

  if (!documentDate) {
    return normalized;
  }

  try {
    return normalizeMatchingText(canonicalizeIssueNumber(value, documentDate));
  } catch {
    return normalized;
  }
};

const parseIssueParts = (value: string, documentDate?: string): ParsedIssueParts | null => {
  const normalized = documentDate ? canonicalizeIssueNumber(value, documentDate) : value;
  const compact = normalizeBracketedRMarker(normalized.toLocaleLowerCase("uk-UA"))
    .replace(/\s*\/\s*/gu, "/")
    .replace(/\s*-\s*/gu, "-")
    .replace(/\s*\(\s*/gu, " (")
    .replace(/\s*\)\s*/gu, ")")
    .replace(/\s+/gu, " ")
    .trim();
  const match = compact.match(/^(\d+)(?:\/(\d+))?(?:-(\d{2}))?(?:\s*\((.+)\))?$/u);

  if (!match?.[1]) {
    return null;
  }

  return {
    primary: match[1].padStart(2, "0"),
    fraction: match[2] ?? null,
    year: match[3] ?? null,
    label: match[4] ? normalizeMatchingText(match[4]) : null,
  };
};

const scoreTokenOverlap = (targetTokens: string[], candidateTokens: string[]) => {
  if (targetTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const candidateSet = new Set(candidateTokens);
  let matched = 0;

  for (const token of targetTokens) {
    if (candidateSet.has(token)) {
      matched += 1;
    }
  }

  return matched / targetTokens.length;
};

const scoreTokenF1 = (targetTokens: string[], candidateTokens: string[]) => {
  if (targetTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const targetSet = new Set(targetTokens);
  const candidateSet = new Set(candidateTokens);
  let matched = 0;

  for (const token of targetSet) {
    if (candidateSet.has(token)) {
      matched += 1;
    }
  }

  if (matched === 0) {
    return 0;
  }

  const precision = matched / candidateSet.size;
  const recall = matched / targetSet.size;

  return (2 * precision * recall) / (precision + recall);
};

const scoreEditSimilarity = (target: string, candidate: string) => {
  if (!target || !candidate) {
    return 0;
  }

  if (target === candidate) {
    return 1;
  }

  const left = Array.from(target);
  const right = Array.from(candidate);

  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
      previous[rightIndex] = current[rightIndex] ?? 0;
    }
  }

  const distance = previous[right.length] ?? Math.max(left.length, right.length);
  const maxLength = Math.max(left.length, right.length);

  return maxLength === 0 ? 0 : 1 - distance / maxLength;
};

const scoreIssueLabelSimilarity = (target: string, candidate: string) =>
  Math.max(scoreTextSimilarity(target, candidate), scoreEditSimilarity(target, candidate));

export const scoreTextSimilarity = (target: string, candidate: string) => {
  const normalizedTarget = normalizeMatchingText(target);
  const normalizedCandidate = normalizeMatchingText(candidate);
  const looseTarget = normalizeLooseMatchingText(target);
  const looseCandidate = normalizeLooseMatchingText(candidate);
  const targetTokens = tokenizeMatchingText(normalizedTarget);
  const candidateTokens = tokenizeMatchingText(normalizedCandidate);

  if (!normalizedTarget || !normalizedCandidate) {
    return 0;
  }

  if (normalizedTarget === normalizedCandidate) {
    return 1;
  }

  if (
    normalizedCandidate.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedCandidate)
  ) {
    return 0.84 + scoreTokenF1(targetTokens, candidateTokens) * 0.12;
  }

  const overlapScore = scoreTokenOverlap(targetTokens, candidateTokens);
  const editScore = scoreEditSimilarity(normalizedTarget, normalizedCandidate);
  const looseEditScore = scoreEditSimilarity(looseTarget, looseCandidate);

  return Math.max(overlapScore * 0.8, editScore * 0.85, looseEditScore * 0.93);
};

export const scoreIssueSimilarity = (
  target: string,
  candidate: string,
  {
    targetDocumentDate,
    candidateDocumentDate,
  }: {
    targetDocumentDate?: string;
    candidateDocumentDate?: string;
  } = {},
) => {
  const parsedTarget = parseIssueParts(target, targetDocumentDate);
  const parsedCandidate = parseIssueParts(candidate, candidateDocumentDate);

  if (!parsedTarget || !parsedCandidate) {
    return scoreTextSimilarity(target, candidate);
  }

  if (
    parsedTarget.primary === parsedCandidate.primary &&
    parsedTarget.fraction === parsedCandidate.fraction &&
    parsedTarget.year === parsedCandidate.year &&
    parsedTarget.label === parsedCandidate.label
  ) {
    return 1;
  }

  let score = 0;

  if (parsedTarget.primary === parsedCandidate.primary) {
    score += 0.5;
  }

  if (parsedTarget.year && parsedCandidate.year && parsedTarget.year === parsedCandidate.year) {
    score += 0.25;
  }

  if (parsedTarget.fraction === parsedCandidate.fraction) {
    score += 0.15;
  } else if (parsedTarget.fraction || parsedCandidate.fraction) {
    score -= 0.15;
  }

  if (parsedTarget.label && parsedCandidate.label) {
    score += (scoreIssueLabelSimilarity(parsedTarget.label, parsedCandidate.label) - 0.5) * 0.2;
  } else if (parsedTarget.label || parsedCandidate.label) {
    score -= 0.05;
  }

  return Number(Math.max(score, 0).toFixed(6));
};
