import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { HotListQueryDto } from './hot-list.dto';

describe('HotListQueryDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: HotListQueryDto,
  };

  it('accepts and preserves supported source parameters', async () => {
    const query = await pipe.transform(
      { area: 'global', page: '2', game: '3' },
      metadata,
    );
    expect(query).toMatchObject({ area: 'global', page: '2', game: '3' });
  });

  it('rejects unknown parameters', async () => {
    await expect(pipe.transform({ typo: '1' }, metadata)).rejects.toMatchObject(
      {
        response: {
          message: expect.arrayContaining(['property typo should not exist']),
        },
      },
    );
  });
});
