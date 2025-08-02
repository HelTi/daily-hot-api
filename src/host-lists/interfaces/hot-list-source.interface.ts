import { HotListGetListResponse } from './hot-list.interface';
import { GetListOptions } from '../sources/source.types';

export interface HotListSource {
  /**
   * 获取热榜列表数据
   * @param noCache 是否忽略缓存
   */
  getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse>;
}
