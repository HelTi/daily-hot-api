import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheService } from './cache/cache.service';
import { getConnectionToken } from '@nestjs/mongoose';

describe('AppController', () => {
  let appController: AppController;
  const homeData = { title: '每日热榜聚合 API' };
  const cacheService = { ping: jest.fn() };
  const mongoConnection = { readyState: 1 };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: { getHomeData: () => homeData } },
        { provide: CacheService, useValue: cacheService },
        { provide: getConnectionToken(), useValue: mongoConnection },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('passes home data to the template', () => {
    expect(appController.getHello()).toEqual(homeData);
  });

  it('reports Redis check result', async () => {
    cacheService.ping.mockResolvedValueOnce(false);
    const health = await appController.getHealth();
    expect(health.checks.redis).toBe(false);
    expect(health.status).toBe('degraded');
  });

  it('reports MongoDB readiness', () => {
    mongoConnection.readyState = 1;
    expect(appController.getReadiness()).toEqual({
      status: 'ready',
      checks: { mongodb: true },
    });
    mongoConnection.readyState = 0;
    expect(() => appController.getReadiness()).toThrow(
      'Service Unavailable Exception',
    );
  });
});
