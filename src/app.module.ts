import { Module } from '@nestjs/common';
import { GameGateway } from './websocket.gateway';

@Module({
  providers: [GameGateway],
})
export class AppModule {}
