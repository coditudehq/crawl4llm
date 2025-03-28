const fs = require("fs").promises;
const path = require("path");
const { parse } = require("yaml");
const UnifiedGetter = require("./UnifiedGetter");
const DocumentRater = require("./DocumentRater");
const Crawler = require("./Crawler");

async function main() {
  const config = await loadConfig();
  const crawler = new Crawler(config);

  // Initialize the queue with seed documents
  const seedDocs = ["doc1", "doc2", "doc3", "doc4", "doc5"];
  await crawler.putDocs(seedDocs);

  let iteration = 0;
  let totalDocs = 0;
  const maxDocs = 20;

  while (totalDocs < maxDocs) {
    try {
      const docs = await crawler.popDocs(5);
      if (!docs || docs.length === 0) {
        console.log("No more documents to process");
        break;
      }

      totalDocs += docs.length;
      const outlinks = await crawler.getOutlinks(docs);
      const unvisitedOutlinks = outlinks.filter(
        (link) => !crawler.visited.has(link)
      );

      if (unvisitedOutlinks.length > 0) {
        await crawler.putDocs(unvisitedOutlinks);
      }

      // Save the current iteration's docids
      const outputDir = path.join("crawl_results", "seed_10k_crawl_20m_length");
      const outputPath = path.join(outputDir, `iter_${iteration}.docids.txt`);
      await fs.writeFile(outputPath, docs.map((doc) => doc.docid).join("\n"));

      iteration++;
    } catch (error) {
      console.error("Error during crawling:", error);
      break;
    }
  }
}

async function loadConfig() {
  const configPath = process.argv[2] || "config.yaml";
  const configContent = await fs.readFile(configPath, "utf8");
  const config = parse(configContent);

  const unifiedGetter = new UnifiedGetter({
    cw22RootPath: config.cw22_root_path,
    seedDocsFile: config.seed_docs_file,
  });

  const qualityRaters = config.rating_methods.map((method) => {
    return new DocumentRater({
      type: method.type,
      name: method.name,
    });
  });

  return {
    unifiedGetter,
    qualityRaters,
    outputDir: config.output_dir,
    numWorkers: config.num_workers,
    maxNumInMemDocs: 1000000,
  };
}

main();
