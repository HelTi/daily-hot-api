import { Provider } from '@nestjs/common';
import { ZhihuSource } from './zhihu.source';
import { BaiduSource } from './baidu.source';
import { BilibiliSource } from './bilibili.source';
import { GitHubSource } from './github.source';
import { JuejinSource } from './juejin.source';
import { Kr36Source } from './36kr.source';
import { _51ctoSource } from './51cto.source';
import { PojieSource } from './52pojie.source';
import { AcFunSource } from './acfun.source';
import { CaixinSource } from './caixin.source';
import { ClsSource } from './cls.source';
import { CoolapkSource } from './coolapk.source';
import { CsdnSource } from './csdn.source';
import { DgtleSource } from './dgtle.source';
import { DoubanGroupSource } from './douban-group.source';
import { DoubanMovieSource } from './douban-movie.source';
import { DouyinSource } from './douyin';
import { EastmoneyStockSource } from './eastmoney-stock.source';
import { EastmoneySource } from './eastmoney.source';
import { GeekparkSource } from './geekpark.source';
import { GuokrSource } from './guokr.source';
import { HackerNewsSource } from './hackernews.source';
import { HelloGitHubSource } from './hellogithub.source';
import { HistorySource } from './history.source';
import { HonkaiSource } from './honkai.source';
import { HostlocSource } from './hostloc.source';
import { HuxiuSource } from './huxiu.source';
import { IfanrSource } from './ifanr.source';
import { IthomeXijiaYiSource } from './ithome-xijiayi.source';
import { IthomeSource } from './ithome.source';
import { JianshuSource } from './jianshu.source';
import { JdSource } from './jd.source';
import { Jin10Source } from './jin10.source';
import { KuaishouSource } from './kuaishou.source';
import { LinuxdoSource } from './linuxdo.source';
import { LolSource } from './lol.source';
import { MiyousheSource } from './miyoushe.source';
import { NeteaseNewsSource } from './netease-news.source';
import { NgabbsSource } from './ngabbs.source';
import { NodeseekSource } from './nodeseek.source';
import { NyTimesSource } from './nytimes.source';
import { ProductHuntSource } from './producthunt.source';
import { QQNewsSource } from './qq-news.source';
import { SinaNewsSource } from './sina-news.source';
import { SinaSource } from './sina.source';
import { SmzdmSource } from './smzdm.source';
import { SsPaiSource } from './sspai.source';
import { StarrailSource } from './starrail.source';
import { TaobaoSource } from './taobao.source';
import { ThepaperSource } from './thepaper.source';
import { TiebaSource } from './tieba.source';
import { ToutiaoSource } from './toutiao.source';
import { V2exSource } from './v2ex.source';
import { WallstreetSource } from './wallstreet.source';
import { WeatheralarmSource } from './weatheralarm.source';
import { WeiboSource } from './weibo.source';
import { WereadSource } from './weread.source';
import { YicaiSource } from './yicai.source';
import { XinyuSource } from './xinyu.source';
import { YystvSource } from './yystv.source';
import { ZhihuDailySource } from './zhihu-daily.source';
import { HupuSource } from './hupu.source';
import { TonghuashunSource } from './tonghuashun.source';
import { GelonghuiSource } from './gelonghui.source';

export const HOT_LIST_SOURCES: Provider[] = [
  ZhihuSource,
  BaiduSource,
  BilibiliSource,
  GitHubSource,
  JuejinSource,
  Kr36Source,
  _51ctoSource,
  PojieSource,
  AcFunSource,
  CaixinSource,
  ClsSource,
  CoolapkSource,
  CsdnSource,
  DgtleSource,
  DoubanGroupSource,
  DoubanMovieSource,
  DouyinSource,
  EastmoneyStockSource,
  EastmoneySource,
  GeekparkSource,
  GuokrSource,
  HackerNewsSource,
  HelloGitHubSource,
  HistorySource,
  HonkaiSource,
  HostlocSource,
  HuxiuSource,
  IfanrSource,
  IthomeXijiaYiSource,
  IthomeSource,
  JianshuSource,
  JdSource,
  Jin10Source,
  KuaishouSource,
  LinuxdoSource,
  LolSource,
  MiyousheSource,
  NeteaseNewsSource,
  NgabbsSource,
  NodeseekSource,
  NyTimesSource,
  ProductHuntSource,
  QQNewsSource,
  SinaNewsSource,
  SinaSource,
  SmzdmSource,
  SsPaiSource,
  StarrailSource,
  TaobaoSource,
  ThepaperSource,
  TiebaSource,
  ToutiaoSource,
  V2exSource,
  WallstreetSource,
  WeatheralarmSource,
  WeiboSource,
  WereadSource,
  YicaiSource,
  XinyuSource,
  YystvSource,
  ZhihuDailySource,
  HupuSource,
  TonghuashunSource,
  GelonghuiSource,
];
