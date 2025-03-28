const fs = require("fs/promises");
const path = require("path");
const Document = require("./Document");

class UnifiedGetter {
  constructor({ cw22RootPath, seedDocsFile }) {
    this.cw22RootPath = cw22RootPath;
    this.seedDocsFile = seedDocsFile;
  }

  async getDoc(docid) {
    if (!docid || typeof docid !== "string") {
      throw new Error(`Invalid docid: ${docid}`);
    }
    const cleanDocid = docid.trim();
    const docPath = path.join(this.cw22RootPath, cleanDocid);
    try {
      const text = await fs.readFile(docPath, "utf8");
      return new Document(cleanDocid, text);
    } catch (error) {
      console.error(`Error retrieving document ${cleanDocid} :`, error);
      return null;
    }
  }

  async getOutlinks(docid) {
    if (!docid || typeof docid !== "string") {
      throw new Error(`Invalid docid: ${docid}`);
    }
    const cleanDocid = docid.trim();
    const outlinksPath = path.join(this.cw22RootPath, `${cleanDocid}.outlinks`);
    try {
      const content = await fs.readFile(outlinksPath, "utf8");
      return content.split("\n").filter((line) => line.trim());
    } catch (error) {
      console.error(`Error retrieving outlinks for ${cleanDocid}:`, error);
      return [];
    }
  }

  async getSeedDocs() {
    try {
      const content = await fs.readFile(this.seedDocsFile, "utf8");
      return content.split("\n").filter((line) => line.trim());
    } catch (error) {
      console.error("Error reading seed documents:", error);
      return [];
    }
  }
}

module.exports = UnifiedGetter;
