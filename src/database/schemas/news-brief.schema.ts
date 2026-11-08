import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type NewsBriefDocument = NewsBrief & Document;

export interface NewsBriefItemDocument {
  id: string;
  title: string;
  summary: string;
  content: string;
  source: {
    code: string;
    name: string;
    url: string;
  };
  publishedAt?: string;
  tags?: string[];
  importance?: number;
  extensions?: Record<string, unknown>;
}

const NewsBriefSourceSchema = new MongooseSchema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false },
);

const NewsBriefItemSchema = new MongooseSchema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    content: { type: String, required: true },
    source: { type: NewsBriefSourceSchema, required: true },
    publishedAt: { type: String },
    tags: { type: [String], default: [] },
    importance: { type: Number },
    extensions: { type: MongooseSchema.Types.Mixed },
  },
  { _id: false },
);

const NewsBriefInputWindowSchema = new MongooseSchema(
  { start: Date, end: Date, lookbackHours: Number },
  { _id: false },
);

@Schema({
  timestamps: true,
})
export class NewsBrief {
  @Prop({ required: true, index: true })
  briefDate: string;

  @Prop({ required: true, default: 'daily', index: true })
  period: string;

  @Prop({ required: true, index: true })
  category: string;

  /** 板块展示名快照：历史数据不随 registry 改名漂移。 */
  @Prop({ required: true })
  categoryName: string;

  @Prop({
    required: true,
    enum: ['generating', 'success', 'failed'],
    default: 'generating',
    index: true,
  })
  status: 'generating' | 'success' | 'failed';

  @Prop()
  title?: string;

  @Prop()
  summary?: string;

  @Prop({ type: [String], default: [] })
  highlights: string[];

  @Prop({ type: [NewsBriefItemSchema], default: [] })
  items: NewsBriefItemDocument[];

  @Prop({ type: [String], default: [] })
  sources: string[];

  @Prop({ type: NewsBriefInputWindowSchema })
  inputWindow: {
    start: Date;
    end: Date;
    lookbackHours: number;
  };

  /** 调试字段：默认投影隐藏。 */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  rawInputItems: Record<string, unknown>[];

  /** 调试字段：P1 搜索证据，默认投影隐藏、P0 恒为空。 */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  searchEvidence: Record<string, unknown>[];

  @Prop()
  model?: string;

  @Prop({ type: [String], default: [] })
  searchProvidersUsed: string[];

  @Prop()
  error?: string;

  @Prop()
  generationId?: string;

  @Prop()
  generationHeartbeatAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const NewsBriefSchema = SchemaFactory.createForClass(NewsBrief);

// 幂等/并发 claim 的基础：同一天、同一 period、同一板块只有一条记录。
NewsBriefSchema.index(
  { briefDate: 1, period: 1, category: 1 },
  { unique: true },
);
// findLatest / 按板块列表（P1）：{ category, status } + briefDate/createdAt 排序。
NewsBriefSchema.index({ category: 1, status: 1, briefDate: -1, createdAt: -1 });
// 全板块最新/列表（P1）。
NewsBriefSchema.index({ status: 1, briefDate: -1, createdAt: -1 });
NewsBriefSchema.index({ briefDate: -1, createdAt: -1 });
