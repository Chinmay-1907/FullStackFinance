import { Schema, model } from "mongoose";

export interface TickerDocument {
  symbol: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tickerSchema = new Schema<TickerDocument>(
  {
    symbol: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    name: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

tickerSchema.index({ symbol: 1 }, { unique: true });

export const TickerModel = model<TickerDocument>("Ticker", tickerSchema);
