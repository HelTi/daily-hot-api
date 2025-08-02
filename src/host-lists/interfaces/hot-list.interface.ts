export interface HotListItem {
  id: string | number;
  title: string;
  desc?: string;
  cover?: string;
  author?: string;
  hot?: number | string;
  timestamp?: number;
  url: string;
  mobileUrl: string;
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
