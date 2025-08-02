export const HOT_SOURCE_METADATA = 'hot-source-metadata';

/**
 * 定义热榜源选项
 */
export interface HotSourceOptions {
  name: string;
  title: string;
  type?: string;
  link?: string;
  description?: string;
}

export function HotSource(options: HotSourceOptions): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(HOT_SOURCE_METADATA, options, target);
  };
}
