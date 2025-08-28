import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SourceConfigDocument = SourceConfig & Document;

@Schema({
  timestamps: true,
})
export class SourceConfig {
  @Prop({ required: true, unique: true, index: true })
  source: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: 30 }) // 默认30分钟抓取一次
  interval: number;

  @Prop()
  lastFetchAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const SourceConfigSchema = SchemaFactory.createForClass(SourceConfig);
