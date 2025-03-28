const { Worker } = require("worker_threads");
const Heap = require("heap");
const fs = require("fs/promises");
const path = require("path");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

class Document {
  constructor(docid, text = null) {
    this.docid = docid;
    this.text = text;
    this.annotations = {};
  }
}

class DocumentAnnotation {
  constructor() {
    this.scores = {};
  }

  setScore(name, value) {
    this.scores[name] = value;
  }

  getScore(name) {
    return this.scores[name];
  }
}

class Crawler {
  constructor(config) {
    this.unifiedGetter = config.unifiedGetter;
    this.qualityRaters = config.qualityRaters;
    this.outputDir = config.outputDir;
    this.numWorkers = config.numWorkers;
    this.maxNumInMemDocs = config.maxNumInMemDocs;
    this.queue = [];
    this.visited = new Set();
    this.requireDocContent = this.qualityRaters.some((rater) =>
      rater.requireDocText()
    );
  }

  compareAnnotations(a, b) {
    // Implement comparison logic based on your scoring criteria
    return 0; // Placeholder
  }

  async putIntoQueue(documents) {
    for (const document of documents) {
      this.queue.push([document.annotations, document.docid]);
      this.visited.add(document.docid);
    }
    logger.info(`Size after put: ${this.queue.length}`);
  }

  static getMeanScoreForLogging(docs) {
    if (!docs || docs.length === 0) return 0;
    const validScores = docs
      .map((doc) => doc.scores || {})
      .filter((scores) => Object.keys(scores).length > 0);
    if (validScores.length === 0) return 0;
    const meanScores = {};
    for (const scores of validScores) {
      for (const [key, value] of Object.entries(scores)) {
        meanScores[key] = (meanScores[key] || 0) + value;
      }
    }
    for (const key in meanScores) {
      meanScores[key] = meanScores[key] / validScores.length;
    }
    return meanScores;
  }

  async logAll(...args) {
    const kwargs = args[0];
    for (const [key, value] of Object.entries(kwargs)) {
      if (typeof value === "number") {
        logger.info(`${key} = ${value.toFixed(2)}`);
      } else {
        logger.info(`${key} = ${value}`);
      }
    }
  }

  popFromQueue(numDocs) {
    const annotations = [];
    const docids = [];
    for (let i = 0; i < numDocs; i++) {
      try {
        const [annotation, docid] = this.queue.pop();
        annotations.push(annotation);
        docids.push(docid);
      } catch (error) {
        break;
      }
    }
    const meanResults = Crawler.getMeanScoreForLogging(annotations);
    const sizeAfterPop = this.queue.length;
    this.logAll({ ...meanResults, sizeAfterPop });
    return docids;
  }

  async findOutlinks(docids, withPredecessorInfo = false) {
    const workers = new Array(this.numWorkers)
      .fill(null)
      .map(() => new Worker(path.join(__dirname, "worker.js")));
    const chunkSize = Math.ceil(docids.length / this.numWorkers);
    const chunks = docids.reduce((acc, docid, index) => {
      const chunkIndex = Math.floor(index / chunkSize);
      if (!acc[chunkIndex]) acc[chunkIndex] = [];
      acc[chunkIndex].push(docid);
      return acc;
    }, []);

    const results = await Promise.all(
      chunks.map(
        (chunk, index) =>
          new Promise((resolve, reject) => {
            workers[index].postMessage({
              type: "getOutlinks",
              docids: chunk,
              cw22RootPath: this.unifiedGetter.cw22RootPath,
            });
            workers[index].on("message", resolve);
            workers[index].on("error", reject);
          })
      )
    );

    const outlinks = results.flat();
    const totalOutlinks = outlinks.length;
    const uniqueOutlinks = new Set(outlinks);
    const totalUniqueOutlinks = uniqueOutlinks.size;

    // Remove visited outlinks
    for (const visited of this.visited) {
      uniqueOutlinks.delete(visited);
    }

    const totalUniqueOutlinksUnvisited = uniqueOutlinks.size;

    await this.logAll({
      totalOutlinks,
      totalUniqueOutlinks,
      totalUniqueOutlinksUnvisited,
      expansionRatio: totalOutlinks / docids.length,
      expansionRatioUnique: totalUniqueOutlinks / docids.length,
      expansionRatioUniqueUnvisited:
        totalUniqueOutlinksUnvisited / docids.length,
      unvisitedRatio: totalUniqueOutlinksUnvisited / totalUniqueOutlinks,
    });

    return withPredecessorInfo
      ? [
          Array.from(uniqueOutlinks),
          results.map((result, index) => [docids[index], result]),
        ]
      : Array.from(uniqueOutlinks);
  }

  async getScoresForDocs(docids) {
    console.log("info: Getting scores for", docids.length, "docs");

    const partitions = [];
    for (let i = 0; i < docids.length; i += this.maxNumInMemDocs) {
      partitions.push(docids.slice(i, i + this.maxNumInMemDocs));
    }

    let results = [];
    for (let i = 0; i < partitions.length; i++) {
      console.log(
        "info: Partition",
        i + 1 + "/" + partitions.length + ":",
        partitions[i].length,
        "docs"
      );
      const partitionResults = await this._getScoresForDocs(
        partitions[i],
        i + 1,
        partitions.length
      );
      results = results.concat(partitionResults);
    }

    console.log(
      "info: docHitRate =",
      (results.length / docids.length).toFixed(2)
    );
    return results;
  }

  async _getScoresForDocs(docids, currentPartition, totalPartitions) {
    let allDocs;
    if (this.requireDocContent) {
      const workers = new Array(this.numWorkers)
        .fill(null)
        .map(() => new Worker(path.join(__dirname, "worker.js")));
      const chunkSize = Math.ceil(docids.length / this.numWorkers);
      const chunks = docids.reduce((acc, docid, index) => {
        const chunkIndex = Math.floor(index / chunkSize);
        if (!acc[chunkIndex]) acc[chunkIndex] = [];
        acc[chunkIndex].push(docid);
        return acc;
      }, []);

      allDocs = await Promise.all(
        chunks.map(
          (chunk, index) =>
            new Promise((resolve, reject) => {
              workers[index].postMessage({
                type: "getDoc",
                docids: chunk,
                cw22RootPath: this.unifiedGetter.cw22RootPath,
              });
              workers[index].on("message", resolve);
              workers[index].on("error", reject);
            })
        )
      );
      allDocs = allDocs.flat().filter((doc) => doc !== null);
    } else {
      allDocs = docids.map((docid) => new Document(docid));
    }

    let results = allDocs;
    for (const qualityRater of this.qualityRaters) {
      results = await qualityRater.rate(results);
    }

    if (this.requireDocContent) {
      for (const document of results) {
        delete document.text;
      }
    }

    return results;
  }

  async writeOutput(iterNum, docids) {
    const outputPath = path.join(this.outputDir, `iter_${iterNum}.docids.txt`);
    await fs.writeFile(outputPath, docids.join("\n"));
  }

  async saveState(iterNum, numSelectedDocs) {
    const state = {
      queue: Array.from(this.queue.toArray()),
      visited: Array.from(this.visited),
      numSelectedDocs,
    };
    const outputPath = path.join(
      this.outputDir,
      `state_${iterNum.toString().padStart(6, "0")}.json`
    );
    await fs.writeFile(outputPath, JSON.stringify(state));
  }

  async initOrResumeState(stateFile) {
    if (!stateFile) {
      logger.info("Starting from scratch");
      return [0, 0];
    }

    logger.info(`Resuming from state file: ${stateFile}`);
    const iterNum = parseInt(stateFile.split("_").pop().split(".")[0]);
    const state = JSON.parse(await fs.readFile(stateFile, "utf8"));

    this.queue = new Heap((a, b) => this.compareAnnotations(a[0], b[0]));
    state.queue.forEach((item) => this.queue.push(item));
    this.visited = new Set(state.visited);

    const numSelectedDocs = state.numSelectedDocs;
    const originalQualityRaters = new Set(
      Object.keys(this.queue.peek()[0].scores)
    );
    const currentQualityRaters = new Set(
      this.qualityRaters.map((rater) => rater.getName())
    );

    if (originalQualityRaters.size !== currentQualityRaters.size) {
      logger.info("Quality raters mismatch");
      logger.info(
        `Quality raters in state file: ${Array.from(originalQualityRaters)}, ` +
          `current quality raters: ${Array.from(currentQualityRaters)}`
      );

      logger.info("Current first item in the queue:");
      logger.info(this.queue.peek());

      logger.info("Recomputing scores for all docs in the queue");
      const recomputed = await this.getScoresForDocs(
        this.queue.toArray().map(([_, docid]) => docid)
      );

      logger.info("Constructing new queue");
      const newQueue = [];
      for (let i = 0; i < recomputed.length; i++) {
        const doc = recomputed[i];
        const [_, docid] = this.queue.toArray()[i];
        if (doc.docid !== docid) throw new Error("Document ID mismatch");
        newQueue.push([doc.annotations, docid]);
      }

      this.queue = new Heap((a, b) => this.compareAnnotations(a[0], b[0]));
      newQueue.forEach((item) => this.queue.push(item));

      logger.info("After recomputation, first item in the queue:");
      logger.info(this.queue.peek());
    }

    return [iterNum, numSelectedDocs];
  }

  async putDocs(docids) {
    const docs = await Promise.all(
      docids.map(async (docid) => {
        if (this.visited.has(docid)) return null;
        const doc = await this.unifiedGetter.getDoc(docid);
        if (!doc) return null;
        this.visited.add(docid);
        return doc;
      })
    );

    const validDocs = docs.filter((doc) => doc !== null);
    if (validDocs.length === 0) return;

    const scoredDocs = await this.getScoresForDocs(validDocs);
    this.queue.push(...scoredDocs);
    console.log("info: Size after put:", this.queue.length);
  }

  async popDocs(count) {
    if (this.queue.length === 0) return [];
    console.log("info: Starting from scratch");
    const docs = this.queue.splice(0, count);
    const avgLength =
      docs.reduce((sum, doc) => sum + (doc.text ? doc.text.length : 0), 0) /
      docs.length;
    console.log("info: length_score =", avgLength.toFixed(2));
    console.log("info: sizeAfterPop =", this.queue.length);
    return docs;
  }

  async getOutlinks(docs) {
    const allOutlinks = await Promise.all(
      docs.map((doc) => this.unifiedGetter.getOutlinks(doc.docid))
    );

    const flatOutlinks = allOutlinks.flat();
    const uniqueOutlinks = [...new Set(flatOutlinks)];
    const unvisitedOutlinks = uniqueOutlinks.filter(
      (link) => !this.visited.has(link)
    );

    console.log("info: totalOutlinks =", flatOutlinks.length.toFixed(2));
    console.log(
      "info: totalUniqueOutlinks =",
      uniqueOutlinks.length.toFixed(2)
    );
    console.log(
      "info: totalUniqueOutlinksUnvisited =",
      unvisitedOutlinks.length.toFixed(2)
    );
    console.log(
      "info: expansionRatio =",
      (flatOutlinks.length / docs.length).toFixed(2)
    );
    console.log(
      "info: expansionRatioUnique =",
      (uniqueOutlinks.length / docs.length).toFixed(2)
    );
    console.log(
      "info: expansionRatioUniqueUnvisited =",
      (unvisitedOutlinks.length / docs.length).toFixed(2)
    );
    console.log(
      "info: unvisitedRatio =",
      (unvisitedOutlinks.length / uniqueOutlinks.length).toFixed(2)
    );

    return unvisitedOutlinks;
  }
}

module.exports = Crawler;
