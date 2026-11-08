import {
  NEWS_CATEGORY_PROFILES,
  getNewsCategoryProfile,
  listNewsCategoryProfiles,
  resolveNewsCategories,
} from './news-category.registry';

describe('news category registry', () => {
  it('registers the four P0 categories exactly once', () => {
    const codes = NEWS_CATEGORY_PROFILES.map((profile) => profile.code);

    expect(codes).toEqual(['finance', 'general', 'tech', 'sports']);
    expect(new Set(codes).size).toBe(codes.length);
    // auto 板块在 P0 被产品确认去掉，不允许回归
    expect(codes).not.toContain('auto');
  });

  it('declares every profile field needed by the generation pipeline', () => {
    for (const profile of NEWS_CATEGORY_PROFILES) {
      expect(profile.name.trim()).not.toBe('');
      expect(profile.description.trim()).not.toBe('');
      expect(profile.focus.trim()).not.toBe('');
      expect(typeof profile.search).toBe('boolean');
    }
  });

  it.each(NEWS_CATEGORY_PROFILES.map((profile) => [profile.code]))(
    'declares non-empty unique sources for %s',
    (code) => {
      const profile = getNewsCategoryProfile(code);

      expect(profile).toBeDefined();
      expect(profile?.sources.length).toBeGreaterThan(0);
      expect(new Set(profile?.sources).size).toBe(profile?.sources.length);
      for (const source of profile?.sources ?? []) {
        expect(source.trim()).not.toBe('');
      }
    },
  );

  it('keeps maxItems within the 3-10 prompt budget', () => {
    for (const profile of NEWS_CATEGORY_PROFILES) {
      expect(profile.maxItems).toBeGreaterThanOrEqual(3);
      expect(profile.maxItems).toBeLessThanOrEqual(10);
    }
  });

  it('looks profiles up by code', () => {
    expect(getNewsCategoryProfile('finance')).toBe(NEWS_CATEGORY_PROFILES[0]);
    expect(getNewsCategoryProfile('auto')).toBeUndefined();
    expect(listNewsCategoryProfiles()).toBe(NEWS_CATEGORY_PROFILES);
  });
});

describe('resolveNewsCategories', () => {
  it('keeps the configured order', () => {
    expect(
      resolveNewsCategories(['sports', 'finance']).map((item) => item.code),
    ).toEqual(['sports', 'finance']);
  });

  it('trims codes and drops duplicates', () => {
    expect(
      resolveNewsCategories([' tech ', 'tech', 'finance', 'finance']).map(
        (item) => item.code,
      ),
    ).toEqual(['tech', 'finance']);
  });

  it('skips blank entries', () => {
    expect(
      resolveNewsCategories(['', '  ', 'general']).map((item) => item.code),
    ).toEqual(['general']);
  });

  it('throws on an unknown category code', () => {
    expect(() => resolveNewsCategories(['finance', 'auto'])).toThrow(
      /Unknown news brief category "auto"/,
    );
  });

  it('throws when no category is enabled', () => {
    expect(() => resolveNewsCategories([])).toThrow(
      /must contain at least one enabled category/,
    );
    expect(() => resolveNewsCategories(['', '  '])).toThrow(
      /must contain at least one enabled category/,
    );
  });
});
