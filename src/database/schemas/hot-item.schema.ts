import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type HotItemDocument = HotItem & Document;

@Schema({
  timestamps: true,
})
export class HotItem {
  @Prop({ required: true, index: true })
  source: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  desc?: string;

  @Prop()
  cover?: string;

  @Prop()
  author?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  hot?: number | string;

  @Prop({ required: true, index: true })
  url: string;

  @Prop()
  mobileUrl?: string;

  @Prop({ required: true, index: true })
  timestamp: number;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const HotItemSchema = SchemaFactory.createForClass(HotItem);

// 创建索引
HotItemSchema.index({ source: 1, url: 1 }); // 去重索引：source + url 组合唯一索引
HotItemSchema.index({ source: 1, timestamp: -1 }); // 查询优化索引
HotItemSchema.index({ timestamp: -1 }); // 查询优化索引
HotItemSchema.index({ title: 'text', desc: 'text' }); // 全文搜索索引
