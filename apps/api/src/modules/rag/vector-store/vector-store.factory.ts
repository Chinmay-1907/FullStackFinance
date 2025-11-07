import { getVectorStoreSelection } from "../../config/config.service";
import { createModuleLogger } from "../../../utils/logger";
import type { IVectorStore } from "./vector-store.types";
import { FaissVectorStore } from "./faiss.vector-store";
import { PineconeVectorStore } from "./pinecone.vector-store";

const log = createModuleLogger("vector-store:factory");

let singleton: IVectorStore | null = null;
let cachedType: ReturnType<typeof getVectorStoreSelection> | null = null;

const buildStore = (selection: ReturnType<typeof getVectorStoreSelection>): IVectorStore => {
  const vectorRoot = process.env["VECTOR_DATA_DIR"];
  switch (selection) {
    case "pinecone":
      return new PineconeVectorStore({
        apiKey: process.env["PINECONE_API_KEY"],
        environment: process.env["PINECONE_ENVIRONMENT"],
        indexName: process.env["PINECONE_INDEX"],
      });
    case "faiss":
    default:
      return new FaissVectorStore({
        basePath: vectorRoot,
      });
  }
};

export const getVectorStore = (): IVectorStore => {
  const selection = getVectorStoreSelection();
  if (!singleton || cachedType !== selection) {
    singleton = buildStore(selection);
    cachedType = selection;
    log.info({ type: selection }, "Vector store driver initialized");
  }
  return singleton;
};

export const resetVectorStore = () => {
  singleton = null;
  cachedType = null;
};
