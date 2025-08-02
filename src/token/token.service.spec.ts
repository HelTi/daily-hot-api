import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from './token.service';
import { CacheService } from '../cache/cache.service';
import { HttpClientService } from '../http/http.service';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: HttpClientService,
          useValue: {
            get: jest.fn().mockResolvedValue({
              data: {
                data: {
                  wbi_img: {
                    img_url: 'https://example.com/test.png',
                    sub_url: 'https://example.com/test2.png',
                  },
                },
              },
              fromCache: false,
              updateTime: new Date().toISOString(),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBiliWbi', () => {
    it('should generate WBI signature', async () => {
      const result = await service.getBiliWbi();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('w_rid=');
    });
  });

  describe('clearBiliWbiCache', () => {
    it('should clear cache successfully', async () => {
      await expect(service.clearBiliWbiCache()).resolves.toBeUndefined();
    });
  });

  describe('generateWbiSignedUrl', () => {
    it('should generate signed URL', async () => {
      const baseUrl = 'https://api.bilibili.com/test';
      const params = { test: 'value' };

      const result = await service.generateWbiSignedUrl(baseUrl, params);
      expect(result).toBeDefined();
      expect(result).toContain(baseUrl);
      expect(result).toContain('w_rid=');
    });
  });
});
