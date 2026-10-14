---
license: cc-by-nc-sa-3.0
tags:
  - math-ocr
  - handwritten-math
  - crohme
  - gguf
  - crispembed
  - bttr
pipeline_tag: image-to-text
datasets:
  - CROHME-2014
---

# BTTR Handwritten Math OCR — GGUF

BTTR (Bidirectional Training for Handwritten Text Recognition) for
handwritten mathematical expression recognition, converted to GGUF
format for [CrispEmbed](https://github.com/CrispStrobe/CrispEmbed).

## License

**CC BY-NC-SA 3.0** — the model code is MIT ([Green-Wood/BTTR](https://github.com/Green-Wood/BTTR)),
but the weights were trained on CROHME 2014 (CC BY-NC-SA 3.0). The
training data license propagates to the trained weights.

- Personal, educational, and research use: **allowed**
- Apps (including commercial): **allowed** — the NC clause applies to the
  weights, not to software that loads them. Users download the weights
  separately and accept the NC terms.
- Redistributing or selling the weights themselves: **not allowed**

The C++ inference engine ([CrispEmbed](https://github.com/CrispStrobe/CrispEmbed),
MIT license) and GGUF converter are original clean-room implementations.

## Model details

| Property | Value |
|----------|-------|
| Architecture | DenseNet encoder + 3-layer Transformer decoder |
| Parameters | 6.5M |
| Training data | CROHME 2014 (CC BY-NC-SA 3.0) |
| Vocabulary | 113 LaTeX tokens |
| CROHME 2014 eval | 49.2% raw / 49.8% parsed (greedy, 986 images) |

## Files

| File | Quant | Size |
|------|-------|------|
| `bttr-hw-f32.gguf` | F32 | 25 MB |
| `bttr-hw-q8_0.gguf` | Q8_0 | 13 MB |
| `bttr-hw-q4_k.gguf` | Q4_K | 11 MB |

## References

- [BTTR code (MIT)](https://github.com/Green-Wood/BTTR)
- [CrispEmbed inference engine (MIT)](https://github.com/CrispStrobe/CrispEmbed)
- [CROHME competition](https://www.isical.ac.in/~crohme/)
