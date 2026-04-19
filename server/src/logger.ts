import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "server.log");

type Level = "INFO" | "WARN" | "ERROR";

function write(level: Level, message: string, extra?: Record<string, unknown>) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  const line = `${new Date().toISOString()} [${level}] ${message}${payload}\n`;
  fs.appendFileSync(LOG_FILE, line, "utf-8");
}

export const logger = {
  info(message: string, extra?: Record<string, unknown>) {
    write("INFO", message, extra);
  },
  warn(message: string, extra?: Record<string, unknown>) {
    write("WARN", message, extra);
  },
  error(message: string, extra?: Record<string, unknown>) {
    write("ERROR", message, extra);
  },
  filePath() {
    return LOG_FILE;
  },
};

