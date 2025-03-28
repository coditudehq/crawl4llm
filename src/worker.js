const { parentPort } = require("worker_threads");
const fs = require("fs/promises");
const path = require("path");
const Document = require("./Document");

// Handle messages from the main thread
parentPort.on("message", async (message) => {
  try {
    const { type, docids, cw22RootPath } = message;

    switch (type) {
      case "getDoc":
        const results = await Promise.all(
          docids.map(async (doc) => {
            const docid = doc?.docid || doc;
            if (!docid || typeof docid !== "string") {
              console.error("Invalid docid:", docid);
              return null;
            }
            const cleanDocid = docid.trim();
            const docPath = path.join(cw22RootPath, cleanDocid);
            try {
              const text = await fs.readFile(docPath, "utf8");
              return new Document(cleanDocid, text);
            } catch (error) {
              console.error(`Error reading document ${cleanDocid}:`, error);
              return null;
            }
          })
        );
        parentPort.postMessage(results.filter((doc) => doc !== null));
        break;

      case "getOutlinks":
        const outlinks = await Promise.all(
          docids.map(async (docid) => {
            if (!docid || typeof docid !== "string") {
              console.error(`Invalid docid: ${docid}`);
              return [];
            }
            try {
              const outlinksPath = path.join(
                cw22RootPath,
                `${docid.trim()}.outlinks`
              );
              const content = await fs.readFile(outlinksPath, "utf8");
              return content.split("\n").filter((line) => line.trim());
            } catch (error) {
              console.error(
                `Error fetching outlinks for document ${docid}:`,
                error
              );
              return [];
            }
          })
        );
        parentPort.postMessage(outlinks.flat());
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error("Worker error:", error);
    parentPort.postMessage([]);
  }
});
