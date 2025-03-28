const { DocumentAnnotation } = require("./Crawler");

class DocumentRater {
  constructor({ type, name }) {
    this.type = type;
    this.name = name;
  }

  requireDocText() {
    return true;
  }

  getName() {
    return this.name;
  }

  async rate(docs) {
    if (!Array.isArray(docs)) {
      throw new Error("Input must be an array of documents");
    }

    for (const doc of docs) {
      if (this.type === "length") {
        doc.scores[this.name] = doc.text ? doc.text.length : 0;
      }
    }

    return docs;
  }
}

module.exports = DocumentRater;
