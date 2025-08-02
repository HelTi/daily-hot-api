import { Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { HotListsController } from './hot-lists.controller';
import { HotListsService } from './hot-lists.service';
import { ZhihuSource } from './sources/zhihu.source';
import { BaiduSource } from './sources/baidu.source';
import { BilibiliSource } from './sources/bilibili.source';
import { GitHubSource } from './sources/github.source';
import { HttpClientModule } from '../http/http.module';
import { TokenModule } from '../token/token.module';
import { RssModule } from '../rss/rss.module';
import { JuejinSource } from './sources/juejin.source';
import { Kr36Source } from './sources/36kr.source';
import { _51ctoSource } from './sources/51cto.source';
import { PojieSource } from './sources/52pojie.source';
import { AcFunSource } from './sources/acfun.source';
import { CaixinSource } from './sources/caixin.source';
import { ClsSource } from './sources/cls.source';
import { CoolapkSource } from './sources/coolapk.source';
import { CsdnSource } from './sources/csdn.source';
import { DgtleSource } from './sources/dgtle.source';
import { DoubanGroupSource } from './sources/douban-group.source';
import { DoubanMovieSource } from './sources/douban-movie.source';
import { DouyinSource } from './sources/douyin';
import { GeekparkSource } from './sources/geekpark.source';
import { GuokrSource } from './sources/guokr.source';
import { HackerNewsSource } from './sources/hackernews.source';
import { HelloGitHubSource } from './sources/hellogithub.source';
import { HistorySource } from './sources/history.source';
import { HonkaiSource } from './sources/honkai.source';
import { HostlocSource } from './sources/hostloc.source';
import { HuxiuSource } from './sources/huxiu.source';
import { IfanrSource } from './sources/ifanr.source';
import { IthomeXijiaYiSource } from './sources/ithome-xijiayi.source';
import { IthomeSource } from './sources/ithome.source';
import { JianshuSource } from './sources/jianshu.source';
import { Jin10Source } from './sources/jin10.source';
import { LinuxdoSource } from './sources/linuxdo.source';
import { LolSource } from './sources/lol.source';
import { MiyousheSource } from './sources/miyoushe.source';
import { NeteaseNewsSource } from './sources/netease-news.source';
import { NgabbsSource } from './sources/ngabbs.source';
import { NodeseekSource } from './sources/nodeseek.source';
import { NyTimesSource } from './sources/nytimes.source';
import { ProductHuntSource } from './sources/producthunt.source';
import { QQNewsSource } from './sources/qq-news.source';
import { SinaNewsSource } from './sources/sina-news.source';
import { SinaSource } from './sources/sina.source';
import { SmzdmSource } from './sources/smzdm.source';
import { SsPaiSource } from './sources/sspai.source';
import { StarrailSource } from './sources/starrail.source';
import { ThepaperSource } from './sources/thepaper.source';
import { TiebaSource } from './sources/tieba.source';
import { ToutiaoSource } from './sources/toutiao.source';
import { V2exSource } from './sources/v2ex.source';
import { WallstreetSource } from './sources/wallstreet.source';
import { WeatheralarmSource } from './sources/weatheralarm.source';
import { WeiboSource } from './sources/weibo.source';
import { WereadSource } from './sources/weread.source';
import { YicaiSource } from './sources/yicai.source';
import { YystvSource } from './sources/yystv.source';
import { ZhihuDailySource } from './sources/zhihu-daily.source';
@Module({
  imports: [
    // 用于自动发现源
    DiscoveryModule,
    // 用于网络请求
    HttpClientModule,
    // 用于Token服务（Bilibili WBI签名）
    TokenModule,
    // 用于RSS生成
    RssModule,
  ],
  controllers: [HotListsController],
  providers: [
    // 这里可以添加更多热榜源
    HotListsService,
    // 注册热榜源
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
    Jin10Source,
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
    ThepaperSource,
    TiebaSource,
    ToutiaoSource,
    V2exSource,
    WallstreetSource,
    WeatheralarmSource,
    WeiboSource,
    WereadSource,
    YicaiSource,
    YystvSource,
    ZhihuDailySource,
  ] as Provider[],
  exports: [HotListsService],
})
export class HotListsModule {}
