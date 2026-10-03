import assert from 'node:assert/strict';
import test from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { logProviderFailure, classifyAnthropicBadRequest, isAnthropicTimeoutError, classifyStopReason, logStopReasonAnomaly, ProviderFailure, AnthropicPreDiagnosisProvider } from '../src/services/preDiagnosisProvider';
import { AnthropicInterviewProvider } from '../src/services/interviewAssistantProvider';
import { AnthropicPostDiagnosisProvider } from '../src/services/postDiagnosisProvider';
import { AnthropicReportDraftProvider } from '../src/services/reportDraftProvider';
import { PreDiagnosisWorker } from '../src/services/preDiagnosisWorker';
import { InterviewAssistantWorker } from '../src/services/interviewAssistantWorker';
import { PostDiagnosisWorker } from '../src/services/postDiagnosisWorker';
import { ReportDraftWorker } from '../src/services/reportDraftWorker';

function captureConsoleError<T>(fn: () => T): { result: T; lines: string[] } {
  const original = console.error;
  const lines: string[] = [];
  console.error = (msg: unknown) => { lines.push(String(msg)); };
  try { return { result: fn(), lines }; } finally { console.error = original; }
}

test('logProviderFailure emits only the fixed safe field set, nothing else', () => {
  const anthropicLikeError = Object.assign(new Error('should never appear in the log'), {
    status: 400,
    type: 'invalid_request_error',
    requestID: 'req_01AbCdEfGhIjKlMnOpQrStUv',
    error: { type: 'invalid_request_error', message: 'the prompt said: 御社のアカウント管理は属人化しています' },
    headers: { authorization: 'Bearer sk-ant-should-never-appear' },
  });
  const { lines } = captureConsoleError(() => logProviderFailure('PRE_DIAGNOSIS_ORGANIZER', 'anthropic', 'claude-sonnet-5', 248, anthropicLikeError));
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]!);
  // reason_code is present because type='invalid_request_error'; its value is
  // 'unknown_invalid_request' since this fixture's message matches no known pattern --
  // itself proof the customer-like text ("the prompt said: ...") never reaches the enum.
  assert.deepEqual(Object.keys(parsed).sort(), ['anthropic_error_type', 'anthropic_request_id', 'error_class', 'event', 'elapsed_ms', 'http_status', 'model', 'provider', 'reason_code', 'stage'].sort());
  assert.equal(parsed.event, 'ai_provider_call_failed');
  assert.equal(parsed.stage, 'PRE_DIAGNOSIS_ORGANIZER');
  assert.equal(parsed.provider, 'anthropic');
  assert.equal(parsed.model, 'claude-sonnet-5');
  assert.equal(parsed.elapsed_ms, 248);
  assert.equal(parsed.http_status, 400);
  assert.equal(parsed.anthropic_error_type, 'invalid_request_error');
  assert.equal(parsed.anthropic_request_id, 'req_01AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(parsed.error_class, 'Error');
  assert.equal(parsed.reason_code, 'unknown_invalid_request');
});

test('logProviderFailure never leaks the error message, error body, or headers', () => {
  const anthropicLikeError = Object.assign(new Error('secret-looking message with prompt content'), {
    status: 401, type: 'authentication_error', requestID: 'req_test',
    error: { type: 'authentication_error', message: 'API key sk-ant-abc123 is invalid' },
    headers: { authorization: 'Bearer sk-ant-abc123', 'x-api-key': 'sk-ant-abc123' },
  });
  const { lines } = captureConsoleError(() => logProviderFailure('PRE_DIAGNOSIS_ORGANIZER', 'anthropic', 'claude-sonnet-5', 10, anthropicLikeError));
  const raw = lines[0]!;
  assert.ok(!raw.includes('sk-ant'), 'must not contain any API-key-shaped string');
  assert.ok(!raw.includes('secret-looking message'), 'must not contain the error message text');
  assert.ok(!raw.includes('prompt content'), 'must not contain the error message text');
  assert.ok(!raw.includes('authorization'), 'must not contain header names/values');
  assert.ok(!raw.toLowerCase().includes('bearer'), 'must not contain an Authorization value');
});

test('classifyAnthropicBadRequest maps known Anthropic message patterns to the expected reason_code', () => {
  const cases: Array<[string, string]> = [
    ["output_config.format.schema: Invalid schema: Enum value 'NOT_YET_CONFIRMED' does not match declared type ['string', 'null']", 'schema_type_enum_conflict'],
    ['output_config.format.schema: Schema is too complex for compilation.', 'schema_complexity'],
    ['output_config.format.schema: maximum nesting depth exceeded', 'schema_depth'],
    ['output_config.format.schema: too many properties defined', 'schema_property_limit'],
    ['output_config.format.schema: unsupported keyword used', 'json_schema'],
    ['output_config.effort is not a valid value', 'output_config'],
    ['messages.1.content.0: invalid block type', 'messages'],
    ['system: must be a string', 'system'],
    ['max_tokens: must be greater than 0', 'max_tokens'],
    ['model: does not support this feature', 'model_parameter'],
    ["'claude-opus-5-5' does not support tool types: computer_20251124.", 'model_parameter'],
    ['"thinking.type.enabled" is not supported for this model.', 'model_parameter'],
    ['tool_choice: type "tool" and "any" are not supported for this model.', 'model_parameter'],
    ['some_new_field is not supported', 'unsupported_parameter'],
  ];
  for (const [message, expected] of cases) assert.equal(classifyAnthropicBadRequest(message), expected, message);
});

test('classifyAnthropicBadRequest falls back safely on unmatched or malformed input', () => {
  for (const input of ['totally unrelated message', '', null, undefined, 123, {}]) {
    assert.equal(classifyAnthropicBadRequest(input as never), 'unknown_invalid_request');
  }
});

test('logProviderFailure for a 400 invalid_request_error never logs the message, only reason_code, even with customer-like or key-like content', () => {
  const customerLike = Object.assign(new Error('irrelevant'), {
    status: 400, type: 'invalid_request_error', requestID: null,
    error: { type: 'invalid_request_error', message: 'output_config.format.schema: too many properties -- company [内部テスト] ABC株式会社 said API key sk-ant-fake123 leaked 御社は属人化しています' },
  });
  const { lines } = captureConsoleError(() => logProviderFailure('PRE_DIAGNOSIS_ORGANIZER', 'anthropic', 'claude-sonnet-5', 251, customerLike));
  const raw = lines[0]!;
  assert.ok(!raw.includes('ABC株式会社'));
  assert.ok(!raw.includes('sk-ant'));
  assert.ok(!raw.includes('属人化'));
  assert.ok(!raw.includes('too many properties'));
  const parsed = JSON.parse(raw);
  assert.equal(parsed.reason_code, 'schema_property_limit');
  assert.deepEqual(Object.keys(parsed).sort(), ['anthropic_error_type', 'anthropic_request_id', 'error_class', 'event', 'elapsed_ms', 'http_status', 'model', 'provider', 'reason_code', 'stage'].sort());
});

test('logProviderFailure for a 401 authentication_error is unchanged: no reason_code field at all', () => {
  const authError = Object.assign(new Error('irrelevant'), {
    status: 401, type: 'authentication_error', requestID: null,
    error: { type: 'authentication_error', message: 'invalid x-api-key' },
  });
  const { lines } = captureConsoleError(() => logProviderFailure('PRE_DIAGNOSIS_ORGANIZER', 'anthropic', 'claude-sonnet-5', 263, authError));
  const parsed = JSON.parse(lines[0]!);
  assert.ok(!('reason_code' in parsed), 'reason_code must only be added for invalid_request_error, preserving prior 401 log shape');
  assert.equal(parsed.anthropic_error_type, 'authentication_error');
});

test('logProviderFailure never leaks customer input even if present on the error object', () => {
  const errorWithCustomerLikeContent = Object.assign(new Error('failed'), {
    status: 400, type: 'invalid_request_error', requestID: 'req_x',
    messages: [{ role: 'user', content: JSON.stringify({ companyName: '[内部テスト] ABC株式会社', answers: ['退職者のアカウント停止は誰が行っていますか'] }) }],
  });
  const { lines } = captureConsoleError(() => logProviderFailure('PRE_DIAGNOSIS_ORGANIZER', 'anthropic', 'claude-sonnet-5', 5, errorWithCustomerLikeContent));
  const raw = lines[0]!;
  assert.ok(!raw.includes('ABC株式会社'));
  assert.ok(!raw.includes('退職者'));
  assert.ok(!raw.includes('companyName'));
});

test('logProviderFailure handles non-Anthropic-SDK errors safely (plain Error, string, undefined)', () => {
  for (const thrown of [new Error('plain'), 'a bare string throw', undefined, { weird: 'shape' }]) {
    const { lines } = captureConsoleError(() => logProviderFailure('PRE_DIAGNOSIS_ORGANIZER', 'anthropic', 'claude-sonnet-5', 1, thrown));
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!);
    assert.equal(parsed.event, 'ai_provider_call_failed');
    assert.ok('error_class' in parsed);
  }
});

test('AnthropicPreDiagnosisProvider still throws the same ProviderFailure codes as before this change', async () => {
  const unconfigured = new AnthropicPreDiagnosisProvider(undefined);
  await assert.rejects(
    unconfigured.organize({ responses: [] } as never, new AbortController().signal),
    (e: unknown) => e instanceof ProviderFailure && e.code === 'AI_NOT_CONFIGURED',
  );
});

test('AnthropicPreDiagnosisProvider wires logProviderFailure into its real catch block (offline: pre-aborted signal, no network dependency)', async () => {
  // A signal that is already aborted before the SDK call starts fails fast and
  // deterministically (no real network round-trip), while still exercising the
  // exact catch block this change touches -- proving the wiring, not just the
  // standalone logProviderFailure function tested above.
  const provider = new AnthropicPreDiagnosisProvider('not-a-real-key');
  const controller = new AbortController();
  controller.abort();
  const { result, lines } = await (async () => {
    const original = console.error;
    const captured: string[] = [];
    console.error = (msg: unknown) => { captured.push(String(msg)); };
    try {
      let caught: unknown;
      try { await provider.organize({ responses: [] } as never, controller.signal); }
      catch (e) { caught = e; }
      return { result: caught, lines: captured };
    } finally { console.error = original; }
  })();
  assert.ok(result instanceof ProviderFailure);
  assert.equal((result as ProviderFailure).code, 'AI_TIMEOUT');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]!);
  assert.equal(parsed.event, 'ai_provider_call_failed');
  assert.equal(parsed.stage, 'PRE_DIAGNOSIS_ORGANIZER');
  assert.ok(typeof parsed.elapsed_ms === 'number' && parsed.elapsed_ms >= 0);
});

// 2026-10-01: a real Production POST_DIAGNOSIS_STRUCTURER call hit the Anthropic SDK's own
// 60s client timeout (APIConnectionTimeoutError) before the worker's 65s outer AbortController
// ever fired, so it was misclassified as AI_PROVIDER_FAILED instead of AI_TIMEOUT. Fix: raise
// only the Post-Diagnosis SDK/worker timeouts (as the next operational measurement point, not
// a confirmed permanent value), and classify APIConnectionTimeoutError as AI_TIMEOUT regardless
// of signal.aborted, across all 4 providers.

test('A: AnthropicPostDiagnosisProvider SDK client timeout is 120000ms', () => {
  const provider = new AnthropicPostDiagnosisProvider('not-a-real-key');
  assert.equal((provider as unknown as { client: Anthropic }).client.timeout, 120000);
  assert.equal((provider as unknown as { client: Anthropic }).client.maxRetries, 0);
});

test('B: PostDiagnosisWorker outer timeoutMs defaults to 125000ms (stays ahead of the SDK timeout)', () => {
  const worker = new PostDiagnosisWorker({} as never, {} as never, {} as never);
  assert.equal((worker as unknown as { timeoutMs: number }).timeoutMs, 125000);
});

test('C: Preparation/Interview Assistant/Report Draft timeouts were not changed by the Post-Diagnosis fix', () => {
  assert.equal((new AnthropicPreDiagnosisProvider('x') as unknown as { client: Anthropic }).client.timeout, 60000);
  assert.equal((new AnthropicInterviewProvider('x') as unknown as { client: Anthropic }).client.timeout, 60000);
  assert.equal((new AnthropicReportDraftProvider('x') as unknown as { client: Anthropic }).client.timeout, 60000);
  assert.equal((new PreDiagnosisWorker({} as never, {} as never) as unknown as { timeoutMs: number }).timeoutMs, 65000);
  assert.equal((new InterviewAssistantWorker({} as never, {} as never, {} as never) as unknown as { timeoutMs: number }).timeoutMs, 65000);
  assert.equal((new ReportDraftWorker({} as never, {} as never, {} as never) as unknown as { timeoutMs: number }).timeoutMs, 65000);
});

test('D: isAnthropicTimeoutError identifies Anthropic.APIConnectionTimeoutError and only that', () => {
  assert.equal(isAnthropicTimeoutError(new Anthropic.APIConnectionTimeoutError()), true);
  assert.equal(isAnthropicTimeoutError(new Anthropic.APIConnectionError({ message: 'connection reset' })), false);
  assert.equal(isAnthropicTimeoutError(new Error('plain timeout-like message')), false);
  assert.equal(isAnthropicTimeoutError(undefined), false);
  assert.equal(isAnthropicTimeoutError({ name: 'APIConnectionTimeoutError' }), false); // shape alone must not fool the check
});

test('D: logProviderFailure + ProviderFailure classify a real APIConnectionTimeoutError as AI_TIMEOUT even when signal.aborted is false', async () => {
  const provider = new AnthropicPostDiagnosisProvider('not-a-real-key');
  const originalCreate = (provider as unknown as { client: { messages: { create: unknown } } }).client.messages.create;
  (provider as unknown as { client: { messages: { create: unknown } } }).client.messages.create = async () => { throw new Anthropic.APIConnectionTimeoutError(); };
  try {
    const controller = new AbortController(); // never aborted -- the SDK's own timeout error must still classify as AI_TIMEOUT
    const { lines } = await (async () => {
      const original = console.error;
      const captured: string[] = [];
      console.error = (msg: unknown) => { captured.push(String(msg)); };
      try {
        let caught: unknown;
        try { await provider.structure({} as never, controller.signal); } catch (e) { caught = e; }
        assert.ok(caught instanceof ProviderFailure);
        assert.equal((caught as ProviderFailure).code, 'AI_TIMEOUT');
        return { lines: captured };
      } finally { console.error = original; }
    })();
    const parsed = JSON.parse(lines[0]!);
    assert.equal(parsed.error_class, 'APIConnectionTimeoutError');
  } finally {
    (provider as unknown as { client: { messages: { create: unknown } } }).client.messages.create = originalCreate;
  }
});

// 2026-10-01/02: a real Production POST_DIAGNOSIS_STRUCTURER call got an Anthropic HTTP
// response within the (now 120s) time budget, but `response.stop_reason !== 'end_turn'`. Our
// own code throws ProviderFailure('AI_PROVIDER_FAILED') directly for this, bypassing
// logProviderFailure() entirely (it only runs for non-ProviderFailure errors), so no
// observability trail existed. Fix: log safe, content-free stop_reason metadata first.

test('A: AnthropicPostDiagnosisProvider logs a safe stop_reason anomaly before throwing AI_PROVIDER_FAILED when stop_reason !== end_turn', async () => {
  const provider = new AnthropicPostDiagnosisProvider('not-a-real-key');
  const originalCreate = (provider as unknown as { client: { messages: { create: unknown } } }).client.messages.create;
  (provider as unknown as { client: { messages: { create: unknown } } }).client.messages.create =
    async () => ({ stop_reason: 'max_tokens', usage: { input_tokens: 2500, output_tokens: 12000 }, content: [{ type: 'text', text: 'should never be read by the caller after this throws' }] });
  try {
    const { lines } = await (async () => {
      const original = console.error;
      const captured: string[] = [];
      console.error = (msg: unknown) => { captured.push(String(msg)); };
      try {
        let caught: unknown;
        try { await provider.structure({} as never, new AbortController().signal); } catch (e) { caught = e; }
        assert.ok(caught instanceof ProviderFailure);
        assert.equal((caught as ProviderFailure).code, 'AI_PROVIDER_FAILED');
        return { lines: captured };
      } finally { console.error = original; }
    })();
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!);
    assert.equal(parsed.event, 'ai_provider_stop_reason_anomaly');
    assert.equal(parsed.stage, 'POST_DIAGNOSIS_STRUCTURER');
    assert.equal(parsed.stop_reason, 'max_tokens');
    assert.equal(parsed.reason_code, 'output_max_tokens_reached');
    assert.equal(parsed.input_tokens, 2500);
    assert.equal(parsed.output_tokens, 12000);
  } finally {
    (provider as unknown as { client: { messages: { create: unknown } } }).client.messages.create = originalCreate;
  }
});

test('B: logStopReasonAnomaly never leaks response content, generated text, or customer-like data, even if present on the input', () => {
  const { lines } = captureConsoleError(() => logStopReasonAnomaly('POST_DIAGNOSIS_STRUCTURER', 'anthropic', 'claude-sonnet-5', 91000, 'max_tokens', {
    input_tokens: 2500, output_tokens: 12000,
    // fields that must never leak if ever accidentally passed through:
    secret: 'sk-ant-should-not-appear', customer: '[内部テスト] ABC株式会社',
  }));
  const raw = lines[0]!;
  assert.ok(!raw.includes('sk-ant'));
  assert.ok(!raw.includes('ABC株式会社'));
  const parsed = JSON.parse(raw);
  assert.deepEqual(Object.keys(parsed).sort(), ['elapsed_ms', 'event', 'input_tokens', 'model', 'output_tokens', 'provider', 'reason_code', 'stage', 'stop_reason'].sort());
});

test('B: logStopReasonAnomaly only accepts numeric usage fields and ignores everything else', () => {
  const { lines } = captureConsoleError(() => logStopReasonAnomaly('POST_DIAGNOSIS_STRUCTURER', 'anthropic', 'claude-sonnet-5', 1, 'max_tokens', {
    input_tokens: 'not-a-number', output_tokens: 5, cache_creation: { customer: 'ABC' },
  }));
  const parsed = JSON.parse(lines[0]!);
  assert.ok(!('input_tokens' in parsed));
  assert.equal(parsed.output_tokens, 5);
  assert.ok(!lines[0]!.includes('ABC'));
});

test('C: classifyStopReason maps every real Anthropic StopReason value (SDK 0.115.0) to a safe fixed reason_code, and falls back safely otherwise', () => {
  const cases: Array<[string, string]> = [
    ['max_tokens', 'output_max_tokens_reached'],
    ['stop_sequence', 'stop_sequence_reached'],
    ['tool_use', 'tool_use_stop'],
    ['pause_turn', 'pause_turn_stop'],
    ['refusal', 'model_refusal'],
    ['model_context_window_exceeded', 'context_window_exceeded'],
  ];
  for (const [stopReason, expected] of cases) assert.equal(classifyStopReason(stopReason), expected);
  for (const input of ['end_turn', 'some_future_sdk_value', '', null, undefined, 123]) assert.equal(classifyStopReason(input as never), 'unexpected_stop_reason');
});
