import { Router } from "express";

import { RagController } from "./rag.controller";

const controller = new RagController();
export const ragRouter: Router = Router();

ragRouter.post("/query", (req, res, next) => {
  void controller.stream(req, res, next);
});
