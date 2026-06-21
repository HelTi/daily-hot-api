export interface HotListItem {
  id: string | number;
  title: string; // 标题
  desc?: string; // 描述
  cover?: string; // 封面
  author?: string; // 作者
  hot?: number | string; // 热度
  timestamp?: number; // 时间戳
  url: string; // 链接
  mobileUrl: string; // 移动端链接
}

// 获取热榜列表的响应数据
export interface HotListGetListResponse {
  data: HotListItem[];
  type?: string; // 榜单名称
  fromCache?: boolean;
  params?: {
    // 榜单类目
    type: {
      name: string;
      type: Record<string, string>;
    };
    range?: {
      name: string;
      type: Record<string, string>;
    };
    [key: string]: {
      name: string;
      type: Record<string, string>;
    };
  };
  [key: string]: any;
}
