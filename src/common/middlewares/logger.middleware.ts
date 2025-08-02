import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger: Logger;
  constructor() {
    this.logger = new Logger('daily-hot-api');
  }
  use(req: Request, res: Response, next: NextFunction) {
    const info = `访问ip:${req.ip}，访问路径:${req.originalUrl}`;
    this.logger.log(info);
    next();
  }
}
