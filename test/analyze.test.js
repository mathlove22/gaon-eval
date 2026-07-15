import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskSchema, extractMessageText, parseStructuredContent, validateAdditionalErrors } from '../api/analyze.js';

const sample = {
  rulesCheck: [],
  achievementStandardsTable: [],
  additionalErrors: []
};

test('순수 JSON 문자열을 처리한다', () => {
  assert.deepEqual(parseStructuredContent(JSON.stringify(sample)), sample);
});

test('마크다운 JSON 코드 블록을 처리한다', () => {
  assert.deepEqual(parseStructuredContent(`설명\n\`\`\`json\n${JSON.stringify(sample)}\n\`\`\``), sample);
});

test('앞뒤 설명이 붙은 JSON 객체를 처리한다', () => {
  assert.deepEqual(parseStructuredContent(`검토 결과입니다.\n${JSON.stringify(sample)}\n완료`), sample);
});

test('배열형 메시지 콘텐츠에서 텍스트를 추출한다', () => {
  const content = [{ type: 'text', text: JSON.stringify(sample) }];
  assert.equal(extractMessageText(content), JSON.stringify(sample));
  assert.deepEqual(parseStructuredContent(content), sample);
});

test('이중 인코딩된 JSON 문자열을 처리한다', () => {
  assert.deepEqual(parseStructuredContent(JSON.stringify(JSON.stringify(sample))), sample);
});

test('불완전한 JSON은 명확하게 거부한다', () => {
  assert.throws(() => parseStructuredContent('{"rulesCheck": ['), SyntaxError);
});

test('전체 스키마에서 작업별 필드만 분리한다', () => {
  const fullSchema = {
    type: 'OBJECT',
    properties: {
      rulesCheck: { type: 'ARRAY', items: { type: 'STRING' } },
      achievementStandardsTable: { type: 'ARRAY', items: { type: 'STRING' } },
      additionalErrors: { type: 'ARRAY', items: { type: 'STRING' } }
    }
  };
  const taskSchema = buildTaskSchema(fullSchema, ['rulesCheck', 'additionalErrors']);
  assert.equal(taskSchema.type, 'object');
  assert.deepEqual(taskSchema.required, ['rulesCheck', 'additionalErrors']);
  assert.deepEqual(Object.keys(taskSchema.properties), ['rulesCheck', 'additionalErrors']);
  assert.equal(taskSchema.additionalProperties, false);
});

test('원문에 없는 인용과 실제 횟수를 넘는 중복을 제거한다', () => {
  const source = '방침에는 정기고사라는 표현이 한 번 있습니다.';
  const items = [
    { message: '용어 확인', quote: '정기고사', location: '방침 1항' },
    { message: '중복 환각', quote: '정기고사', location: '총괄표' },
    { message: '없는 인용', quote: '지필평가', location: '평가표' }
  ];
  assert.deepEqual(validateAdditionalErrors(items, source), [items[0]]);
});

test('PDF처럼 원문 텍스트가 없을 때도 인용과 위치를 필수로 요구한다', () => {
  const valid = { message: '용어 확인', quote: '정기고사', location: '7페이지 방침 1항' };
  assert.deepEqual(validateAdditionalErrors([valid, { message: '증거 없음', quote: '', location: '' }]), [valid]);
});
