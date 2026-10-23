import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { CacheService } from '../src/cache/cache.service';
import { getConnectionToken } from '@nestjs/mongoose';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const mongoConnection = { readyState: 1 };

  beforeEach(async () => {
    mongoConnection.readyState = 1;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: { getHomeData: () => ({}) } },
        {
          provide: CacheService,
          useValue: { ping: () => Promise.resolve(true) },
        },
        { provide: getConnectionToken(), useValue: mongoConnection },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      checks: { redis: true },
    });
  });

  it('/ready (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(200);
    expect(response.body).toEqual({
      status: 'ready',
      checks: { mongodb: true },
    });
  });

  it('/ready returns 503 when MongoDB is disconnected', async () => {
    mongoConnection.readyState = 0;
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(503);
    expect(response.body).toMatchObject({
      status: 'not_ready',
      checks: { mongodb: false },
    });
  });
});
