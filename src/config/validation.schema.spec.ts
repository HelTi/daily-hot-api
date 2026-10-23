import { configValidationSchema } from './validation.schema';

describe('configValidationSchema', () => {
  it('uses one set of defaults for runtime configuration', () => {
    const config = configValidationSchema.parse({});
    expect(config.PORT).toBe(6689);
    expect(config.SCHEDULER_AUTO_START).toBe(false);
    expect(config.BRIEF_SOURCES).toContain('gelonghui');
    expect(config.REQUEST_TIMEOUT).toBe(6000);
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
