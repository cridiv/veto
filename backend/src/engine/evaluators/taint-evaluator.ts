import type { ActionRequest, UntrustedContent } from '@veto/contracts';

export type TaintFinding = {
  param: string;
  value: string;
  source: string;
  matchedExcerpt: string;
};

export type TaintResult = {
  isTainted: boolean;
  findings: TaintFinding[];
  message?: string;
};

/**
 * Common stop words to exclude from substring taint matching
 * to avoid false positives on ubiquitous English words.
 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have',
  'will', 'your', 'about', 'would', 'there', 'their', 'what',
  'true', 'false', 'null', 'undefined', 'none', 'user', 'test',
  'http', 'https', 'email', 'name', 'item', 'list', 'data',
]);

/**
 * Regular expressions for extracting high-value entity tokens from untrusted text.
 */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const DOMAIN_REGEX = /\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?\b/gi;
const IDENTIFIER_REGEX = /\b(?:0x[a-fA-F0-9]{8,}|[0-9]{6,})\b/g;

/**
 * Evaluates whether any values in request.args originated from untrusted data sources.
 *
 * @param request The incoming ActionRequest containing args and untrusted sources.
 * @returns TaintResult detailing whether taint was found, the specific parameter, and the source.
 */
export function evaluateTaint(request: ActionRequest): TaintResult {
  const untrustedList = request.untrusted;
  if (!untrustedList || untrustedList.length === 0) {
    return { isTainted: false, findings: [] };
  }

  const findings: TaintFinding[] = [];

  for (const untrusted of untrustedList) {
    if (!untrusted.excerpt || untrusted.excerpt.trim() === '') continue;

    const excerptLower = untrusted.excerpt.toLowerCase();
    const extractedEntities = extractEntities(untrusted.excerpt);

    // Recursively scan all arguments
    scanArgs(request.args, '', (paramPath, stringVal) => {
      const valLower = stringVal.toLowerCase().trim();

      // Skip empty or very short strings
      if (valLower.length < 4 || STOP_WORDS.has(valLower)) {
        return;
      }

      // Check 1: Entity exact match (Email, domain, ID)
      for (const entity of extractedEntities) {
        if (valLower === entity.toLowerCase() || valLower.includes(entity.toLowerCase())) {
          findings.push({
            param: `args.${paramPath}`,
            value: stringVal,
            source: untrusted.source,
            matchedExcerpt: truncate(untrusted.excerpt, 80),
          });
          return;
        }
      }

      // Check 2: Verbatim substring match for identifiers or non-trivial phrases
      if (excerptLower.includes(valLower)) {
        findings.push({
          param: `args.${paramPath}`,
          value: stringVal,
          source: untrusted.source,
          matchedExcerpt: truncate(untrusted.excerpt, 80),
        });
      }
    });
  }

  if (findings.length > 0) {
    const first = findings[0];
    const message = `Taint detected in "${first.param}" (value: "${first.value}"): data originated from untrusted source "${first.source}".`;
    return {
      isTainted: true,
      findings,
      message,
    };
  }

  return { isTainted: false, findings: [] };
}

function extractEntities(text: string): Set<string> {
  const entities = new Set<string>();

  const emails = text.match(EMAIL_REGEX) || [];
  for (const email of emails) entities.add(email);

  const domains = text.match(DOMAIN_REGEX) || [];
  for (const domain of domains) entities.add(domain);

  const ids = text.match(IDENTIFIER_REGEX) || [];
  for (const id of ids) entities.add(id);

  return entities;
}

function scanArgs(
  obj: unknown,
  currentPath: string,
  onString: (path: string, val: string) => void,
): void {
  if (typeof obj === 'string') {
    onString(currentPath, obj);
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const newPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
      scanArgs(obj[i], newPath, onString);
    }
  } else if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}.${k}` : k;
      scanArgs(v, newPath, onString);
    }
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
