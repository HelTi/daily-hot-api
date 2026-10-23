import { configValidationSchema } from './validation.schema';

describe('configValidationSchema', () => {
  it('uses one set of defaults for runtime configuration', () => {
    const config = configValidationSchema.parse({});
    expect(config.PORT).toBe(6689);
    expect(config.SCHEDULER_AUTO_START).toBe(false);
    expect(config.BRIEF_SOURCES).toContain('gelonghui');
    expect(config.REQUEST_TIMEOUT).toBe(6000);
  });

  it('rejects a topic count the prompt budget cannot carry', () => {
    // 超过 PROMPT_BUDGET.maxTopics 的主题进不了提示词，只会白付 Tavily 费用。
    expect(() =>
      configValidationSchema.parse({ BRIEF_MAX_TOPICS: '20' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({ BRIEF_MAX_TOPICS: '8' }).BRIEF_MAX_TOPICS,
    ).toBe(8);
  });

  it('rejects invalid boolean values', () => {
    expect(() =>
      configValidationSchema.parse({ BRIEF_ENABLED: 'yes' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({ BRIEF_ENABLED: 'true' }).BRIEF_ENABLED,
    ).toBe(true);
  });
});
