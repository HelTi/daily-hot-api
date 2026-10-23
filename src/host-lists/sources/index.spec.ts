import {
  HOT_SOURCE_METADATA,
  HotSourceOptions,
} from '../decorators/hot-source.decorator';
import { HOT_LIST_SOURCES } from './index';

describe('hot list source registry', () => {
  it('registers every source once with a unique metadata name', () => {
    expect(HOT_LIST_SOURCES).toHaveLength(64);
    const names = HOT_LIST_SOURCES.map((provider) => {
      expect(typeof provider).toBe('function');
      const metadata = Reflect.getMetadata(HOT_SOURCE_METADATA, provider) as
        | HotSourceOptions
        | undefined;
      expect(metadata?.name).toBeTruthy();
      return metadata?.name;
    });
    expect(new Set(names).size).toBe(names.length);
  });
});
