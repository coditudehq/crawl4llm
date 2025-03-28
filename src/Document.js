class Document {
  constructor(docid, text = "") {
    this.docid = docid;
    this.text = text;
    this.scores = {};
  }

  getScore(key) {
    return this.scores[key] || 0;
  }

  setScore(key, value) {
    this.scores[key] = value;
  }
}

module.exports = Document;
