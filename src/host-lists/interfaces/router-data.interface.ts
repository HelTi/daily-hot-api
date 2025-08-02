import { HotListItem } from './hot-list.interface';

export interface RouterData {
  name: string;
  title: string;
  type: string;
  description?: string;
  link?: string;
  total: number;
  data: HotListItem[];
  fromCache?: boolean;
  updateTime?: string;
  message?: string;
  params?: {
    // 热点类别参数
    type: {
      name: string;
      type: Record<string, string>;
    };
  };
}
