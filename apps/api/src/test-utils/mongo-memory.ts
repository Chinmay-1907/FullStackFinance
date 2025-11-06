import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

import { connectDB, disconnectDB } from "../db/connection";
import { resetEnvConfigCache } from "../modules/config/config.service";

let memoryServer: MongoMemoryServer | null = null;

export const setupTestMongo = async () => {
  memoryServer = await MongoMemoryServer.create();
  const uri = memoryServer.getUri();

  process.env["MONGO_URI"] = uri;
  process.env["REDIS_URL"] = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  resetEnvConfigCache();

  await connectDB();
};

export const teardownTestMongo = async () => {
  await disconnectDB();

  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
};

export const clearTestMongo = async () => {
  const { collections } = mongoose.connection;
  const tasks = Object.values(collections).map((collection) => collection.deleteMany({}));
  await Promise.all(tasks);
};
