import { Module } from '@nestjs/common';
import { TokenService } from './token.service';
import { HttpClientModule } from '../http/http.module';

@Module({
  imports: [HttpClientModule],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
