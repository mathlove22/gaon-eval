const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-3.5-flash';

function normalizeSchema(value) {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  if (!value || typeof value !== 'object') return value;

  const normalized = {};
  for (const [key, child] of Object.entries(value)) {
    normalized[key] = key === 'type' && typeof child === 'string'
      ? child.toLowerCase()
      : normalizeSchema(child);
  }

  if (normalized.type === 'object' && normalized.properties) {
    normalized.required = Object.keys(normalized.properties);
    normalized.additionalProperties = false;
  }
  return normalized;
}

function toOpenRouterContent(parts) {
  return parts.map((part) => {
    if (typeof part?.text === 'string') {
      return { type: 'text', text: part.text };
    }

    const inlineData = part?.inlineData;
    if (!inlineData?.mimeType || !inlineData?.data) {
      throw new Error('지원하지 않는 첨부 데이터입니다.');
    }

    const dataUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`;
    if (inlineData.mimeType === 'application/pdf') {
      return {
        type: 'file',
        file: {
          filename: part.fileName || 'document.pdf',
          file_data: dataUrl
        }
      };
    }

    if (inlineData.mimeType.startsWith('image/')) {
      return { type: 'image_url', image_url: { url: dataUrl } };
    }

    throw new Error('PDF 또는 이미지 파일만 첨부할 수 있습니다.');
  });
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function extractMessageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .join('')
      .trim();
  }
  if (content && typeof content === 'object') return content;
  return '';
}

export function parseStructuredContent(content) {
  const extracted = extractMessageText(content);
  if (extracted && typeof extracted === 'object') return extracted;
  if (typeof extracted !== 'string' || !extracted.trim()) {
    throw new SyntaxError('응답 내용이 비어 있습니다.');
  }

  const trimmed = extracted.trim();
  const candidates = [trimmed];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') return JSON.parse(parsed);
      return parsed;
    } catch {
      // 다음 후보 형식을 시도한다.
    }
  }

  throw new SyntaxError('유효한 JSON 객체를 찾지 못했습니다.');
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return response.status(500).json({ error: '서버에 OpenRouter API 키가 설정되지 않았습니다.' });
  }

  if (!process.env.APP_ACCESS_CODE) {
    return response.status(500).json({ error: '서버에 교직원 접속 코드가 설정되지 않았습니다.' });
  }

  try {
    const { parts, systemPrompt, schema, accessCode } = request.body || {};
    if (!safeEqual(accessCode, process.env.APP_ACCESS_CODE)) {
      return response.status(401).json({ error: '교직원 접속 코드가 올바르지 않습니다.' });
    }

    if (!Array.isArray(parts) || !parts.length || typeof systemPrompt !== 'string' || !schema) {
      return response.status(400).json({ error: '검토 요청 데이터가 올바르지 않습니다.' });
    }

    const content = toOpenRouterContent(parts);
    const hasPdf = parts.some((part) => part?.inlineData?.mimeType === 'application/pdf');
    const payload = {
      model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'evaluation_plan_review',
          strict: true,
          schema: normalizeSchema(schema)
        }
      },
      reasoning: { effort: 'medium' },
      temperature: 0,
      max_tokens: 16000,
      stream: false
    };

    payload.plugins = [{ id: 'response-healing' }];
    if (hasPdf) {
      payload.plugins.push({ id: 'file-parser', pdf: { engine: 'native' } });
    }

    const openRouterResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://github.com/mathlove22/gaon-eval',
        'X-Title': 'Gaon High School Evaluation Plan Reviewer'
      },
      body: JSON.stringify(payload)
    });

    const data = await openRouterResponse.json().catch(() => ({}));
    if (!openRouterResponse.ok) {
      const message = data?.error?.message || `OpenRouter 요청 실패 (${openRouterResponse.status})`;
      return response.status(openRouterResponse.status).json({ error: message });
    }

    const choice = data?.choices?.[0];
    const rawContent = choice?.message?.content;
    if (!rawContent) {
      return response.status(502).json({ error: 'Gemini가 빈 응답을 반환했습니다.' });
    }

    if (choice.finish_reason === 'length') {
      console.warn('OpenRouter response truncated', {
        requestId: data?.id,
        model: data?.model,
        provider: data?.provider
      });
      return response.status(502).json({
        error: '검토 결과가 너무 길어 출력이 중단되었습니다. PDF를 나누거나 필요한 부분만 올려 다시 시도해주세요.'
      });
    }

    let parsed;
    try {
      parsed = parseStructuredContent(rawContent);
    } catch (parseError) {
      console.error('Structured response parsing failed', {
        requestId: data?.id,
        model: data?.model,
        provider: data?.provider,
        finishReason: choice?.finish_reason,
        contentType: Array.isArray(rawContent) ? 'array' : typeof rawContent,
        contentLength: typeof rawContent === 'string' ? rawContent.length : undefined,
        message: parseError.message
      });
      return response.status(502).json({
        error: 'Gemini가 완전한 JSON 형식으로 응답하지 않았습니다. 자동 복구에도 실패했습니다. 잠시 후 다시 시도해주세요.'
      });
    }

    if (!parsed || !Array.isArray(parsed.rulesCheck) || !Array.isArray(parsed.achievementStandardsTable) || !Array.isArray(parsed.additionalErrors)) {
      return response.status(502).json({ error: 'Gemini 응답에 필요한 검토 결과 항목이 빠져 있습니다. 다시 시도해주세요.' });
    }
    return response.status(200).json(parsed);
  } catch (error) {
    console.error('Evaluation analysis failed:', error);
    const message = error instanceof SyntaxError
      ? 'Gemini 응답을 JSON으로 해석하지 못했습니다. 다시 시도해주세요.'
      : error.message || '검토 중 서버 오류가 발생했습니다.';
    return response.status(500).json({ error: message });
  }
}
