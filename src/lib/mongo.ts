import { MongoClient, type Db } from "mongodb";

const DB_NAME = process.env.MONGODB_DB || "stock_control_room";

// Reuse one client across hot reloads and warm serverless invocations.
const globalForMongo = globalThis as unknown as { _scrMongo?: Promise<MongoClient> };

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!globalForMongo._scrMongo) {
    const promise = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect();
    promise.catch(() => {
      if (globalForMongo._scrMongo === promise) globalForMongo._scrMongo = undefined;
    });
    globalForMongo._scrMongo = promise;
  }
  return (await globalForMongo._scrMongo).db(DB_NAME);
}
