/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  clearMocks: true,
  moduleNameMapper: {
    "^@fin-rag/shared$": "<rootDir>/../../packages/shared/src/index.ts",
    "^@fin-rag/shared/(.*)$": "<rootDir>/../../packages/shared/src/$1"
  }
};
