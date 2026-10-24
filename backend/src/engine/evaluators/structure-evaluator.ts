import type { ActionRequest } from '@veto/contracts';

export type AnomalyType = 'command_injection' | 'path_traversal' | 'obfuscation';

export type StructureResult = {
  hasAnomaly: boolean;
  anomalyType?: AnomalyType;
  param?: string;
  evidence?: string;
  message?: string;
};

/**
 * Fields that are typically free-form human text where characters
 * like '|', '&', or ';' might appear legitimately (e.g. "Acme | Q3 Update", "Tom & Jerry").
 */
const FREE_FORM_FIELDS = new Set([
  'body',
  'message',
  'content',
  'text',
  'description',
  'subject',
  'prompt',
  'notes',
  'summary',
  'title',
]);

/**
 * Common shell chaining and execution metacharacters
 */
const COMMAND_INJECTION_PATTERN = /(?:[;&|`$]|\$\(|\$\{)\s*(?:cat|rm|curl|wget|bash|sh|zsh|python|perl|nc|sudo|chmod|chown|kill|exec|eval)\b/i;

/**
 * Path traversal sequences targeting directory escapes or system roots
 */
const PATH_TRAVERSAL_PATTERN = /(?:\.\.[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)|(?:^|[/\\])(?:etc|proc|sys|root)[/\\]/i;

/**
 * Suspicious hex or base64 command obfuscation patterns
 */
const OBFUSCATION_PATTERN = /(?:base64\s+-d|%2e%2e%2f|%2e%2e\/|\.\.%2f)/i;

/**
 * Recursively walks tool arguments and checks for structural anomalies.
 *
 * @param request The incoming ActionRequest containing tool and args.
 * @returns StructureResult with an explicit reason message if an anomaly is detected.
 */
export function evaluateStructure(request: ActionRequest): StructureResult {
  const args = request.args ?? {};

  for (const [key, value] of Object.entries(args)) {
    const isFreeForm = FREE_FORM_FIELDS.has(key.toLowerCase());
    const anomaly = inspectValue(key, value, isFreeForm, request.tool);
    if (anomaly.hasAnomaly) {
      return anomaly;
    }
  }

  return { hasAnomaly: false };
}

function inspectValue(
  path: string,
  val: unknown,
  isFreeForm: boolean,
  tool: string,
): StructureResult {
  if (typeof val === 'string') {
    // 1. Obfuscated encoding check (checked across all fields)
    if (OBFUSCATION_PATTERN.test(val)) {
      const match = val.match(OBFUSCATION_PATTERN);
      return {
        hasAnomaly: true,
        anomalyType: 'obfuscation',
        param: `args.${path}`,
        evidence: match ? match[0] : val,
        message: `Flagged suspicious encoding/obfuscation in "args.${path}": detected pattern "${match ? match[0] : ''}".`,
      };
    }

    // 2. Command injection check:
    // If field is NOT free-form, inspect for shell operators followed by commands
    if (!isFreeForm) {
      if (COMMAND_INJECTION_PATTERN.test(val)) {
        const match = val.match(COMMAND_INJECTION_PATTERN);
        return {
          hasAnomaly: true,
          anomalyType: 'command_injection',
          param: `args.${path}`,
          evidence: match ? match[0] : val,
          message: `Flagged potential command injection in "args.${path}": parameter contains shell operator with executable command ("${match ? match[0] : ''}").`,
        };
      }

      // Check for raw shell operators in filename/path/target parameters (where even standalone pipes or semicolons shouldn't exist)
      if (isStrictParam(path) && /[;&|`$]/.test(val)) {
        const match = val.match(/[;&|`$]/);
        return {
          hasAnomaly: true,
          anomalyType: 'command_injection',
          param: `args.${path}`,
          evidence: match ? match[0] : val,
          message: `Flagged potential command injection in "args.${path}": structural file/path parameter contains unexpected shell metacharacter ("${match ? match[0] : ''}").`,
        };
      }
    }

    // 3. Path traversal check (checked on path/file/target/dir fields or any non-freeform field)
    if (!isFreeForm || isPathLikeParam(path)) {
      if (PATH_TRAVERSAL_PATTERN.test(val)) {
        return {
          hasAnomaly: true,
          anomalyType: 'path_traversal',
          param: `args.${path}`,
          evidence: val,
          message: `Flagged path traversal in "args.${path}": parameter contains directory escape sequence or restricted root path ("${val}").`,
        };
      }
    }
  } else if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      const res = inspectValue(`${path}[${i}]`, val[i], isFreeForm, tool);
      if (res.hasAnomaly) return res;
    }
  } else if (val !== null && typeof val === 'object') {
    for (const [subKey, subVal] of Object.entries(val)) {
      const subIsFreeForm = isFreeForm || FREE_FORM_FIELDS.has(subKey.toLowerCase());
      const res = inspectValue(`${path}.${subKey}`, subVal, subIsFreeForm, tool);
      if (res.hasAnomaly) return res;
    }
  }

  return { hasAnomaly: false };
}

function isPathLikeParam(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes('path') || lower.includes('file') || lower.includes('dir') || lower.includes('folder');
}

function isStrictParam(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower === 'path' ||
    lower === 'filename' ||
    lower === 'file' ||
    lower === 'dir' ||
    lower === 'directory' ||
    lower === 'target' ||
    lower === 'cmd' ||
    lower === 'command'
  );
}
