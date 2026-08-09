import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type DailyBriefDocument = DailyBrief & Document;

@Schema({
  timestamps: true,
})
export class DailyBrief {
  @Prop({ required: true, index: true })
  briefDate: string;

  @Prop({ required: true, default: 'daily', index: true })
  period: string;

  @Prop({
    required: true,
    enum: ['generating', 'success', 'failed'],
    default: 'generating',
    index: true,
  })
  status: 'generating' | 'success' | 'failed';

  @Prop({ type: [String], default: [] })
  sources: string[];

  @Prop({
    type: {
      start: Date,
      end: Date,
      lookbackHours: Number,
    },
  })
  inputWindow: {
    start: Date;
    end: Date;
    lookbackHours: number;
  };

  @Prop({ type: MongooseSchema.Types.Mixed })
  analysis?: Record<string, unknown>;

  @Prop()
  markdown?: string;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  rawInputItems: Record<string, unknown>[];

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  searchEvidence: Record<string, unknown>[];

  @Prop()
  model?: string;

  @Prop({ default: false })
  tavilyUsed: boolean;

  @Prop()
  error?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const DailyBriefSchema = SchemaFactory.createForClass(DailyBrief);

DailyBriefSchema.index({ briefDate: 1, period: 1 }, { unique: true });
DailyBriefSchema.index({ createdAt: -1 });

// list()：默认排序 { briefDate: -1, createdAt: -1 }，query 可能为空
DailyBriefSchema.index({ briefDate: -1, createdAt: -1 });
// findLatest()：{ status: 'success' } + 同样的排序；
// 也覆盖 getStockRanking 不带 period 时的 { status, briefDate } 匹配（反向扫描）
DailyBriefSchema.index({ status: 1, briefDate: -1, createdAt: -1 });
// getStockRanking()：{ status, period, briefDate 区间 } + { briefDate: 1, createdAt: 1 } 排序
DailyBriefSchema.index({ status: 1, period: 1, briefDate: 1, createdAt: 1 });
