import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskSchema, extractMessageText, parseStructuredContent } from '../api/analyze.js';

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
