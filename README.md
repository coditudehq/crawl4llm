# JS-Craw4LLM

This is a JavaScript implementation of the [Craw4LLM](https://github.com/mlfoundations/craw4llm) project, which provides efficient web crawling for LLM pretraining.

## Prerequisites

1. Node.js >= 16.x
2. [Request the ClueWeb22 dataset](https://lemurproject.org/clueweb22/)
3. [Download the DCLM fastText classifier](https://huggingface.co/mlfoundations/fasttext-oh-eli5/tree/main) to `fasttext_scorers/`

> [!IMPORTANT]
> To run the crawler efficiently, the ClueWeb22 data should be placed on **an SSD**.

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/js-craw4llm.git
cd js-craw4llm
```

2. Install dependencies:

```bash
npm install
```

## Configuration

Create a YAML configuration file (e.g., `config.yaml`) with the following content:

```yaml
cw22_root_path: <path_to_clueweb22_a>
seed_docs_file: seed.txt
output_dir: crawl_results/seed_10k_crawl_20m_dclm_fasttext
num_selected_docs_per_iter: 10000
num_workers: 16 # set to a number that fits your machine
save_state_every: -1 # set to a positive number to save the state (queue & visited set) of the crawler every certain steps
max_num_docs: 20000000
selection_method: dclm_fasttext_score
order: desc # desc for descending, asc for ascending
rating_methods:
  - type: length
  - type: fasttext_score
    rater_name: dclm_fasttext_score
    model_path: fasttext_scorers/openhermes_reddit_eli5_vs_rw_v2_bigram_200k_train.bin
```

## Usage

To run the crawler:

```bash
node src/index.js config.yaml
```

The crawler will:

1. Read the configuration file
2. Initialize the necessary components (UnifiedGetter, DocumentRater, etc.)
3. Start crawling documents based on the specified criteria
4. Save results to the specified output directory

## Project Structure

```
js-craw4llm/
├── src/
│   ├── Crawler.js         # Main crawler implementation
│   ├── DocumentRater.js   # Document scoring logic
│   ├── UnifiedGetter.js   # Document retrieval logic
│   ├── worker.js          # Worker thread implementation
│   └── index.js           # Main entry point
├── config.yaml            # Configuration file
├── package.json           # Project dependencies
└── README.md             # This file
```

## Key Differences from Python Version

1. Uses Node.js worker threads instead of Python's multiprocessing
2. Implements async/await patterns for better concurrency
3. Uses JavaScript's native Set and Map data structures
4. Implements a custom heap implementation for the priority queue
5. Uses Winston for logging instead of Python's logging module

## Limitations and Alternatives

1. **Memory Management**: JavaScript's garbage collection is less predictable than Python's. The implementation includes memory management strategies to handle large datasets.

2. **File I/O**: Node.js file system operations are asynchronous by default, which is handled using async/await patterns.

3. **Concurrency**: Instead of Python's multiprocessing, this implementation uses Node.js worker threads for parallel processing.

4. **Machine Learning**: The fastText implementation uses a JavaScript port of the library. Some advanced features might not be available.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the same terms as the original Craw4LLM project.
