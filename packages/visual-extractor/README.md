# @vaagatech/anvesh-visual-extractor

Non-AI Document OCR, dominant textile color palette analyzer, and motif/pattern edge descriptor engine for Anvesh Search.

## Features

- **Local Pure-CPU OCR**: Text and label recognition via embedded `tesseract.js` worker. Zero cloud AI API calls.
- **Textile Color Palette Analyzer**: Maps RGB/RGBA image buffers to a rich palette dictionary (`"Gold Zari"`, `"Royal Blue"`, `"Crimson Red"`, `"Emerald Green"`, etc.).
- **Motif & Texture Edge Descriptor**: Gradient frequency & edge density heuristics to identify patterns (`"Elephant Motif"`, `"Temple Border"`, `"Kattam Checks"`, `"Buttas"`).
- **Searchable Tag Generator**: Combines extracted attributes into searchable tokens for full-text and vector ingestion.

## Installation

```bash
npm install @vaagatech/anvesh-visual-extractor
```

## Usage

```typescript
import { VisualExtractor, matchNearestColor, analyzeMotifsFromBuffer } from "@vaagatech/anvesh-visual-extractor";

const extractor = new VisualExtractor();
const result = await extractor.extract("path/to/saree-image.jpg");

console.log("Dominant Colors:", result.colors.dominant);
console.log("Detected Motifs:", result.motifs.motifs);
console.log("OCR Text:", result.ocr.text);
console.log("Searchable Text:", result.searchableText);
```

## License

Apache-2.0 © [VaagaTech](https://www.vaagatech.com)
