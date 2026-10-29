# Pretrained vision backbone

Base model: `timm/mobilenetv3_small_100.lamb_in1k`, Apache-2.0, ImageNet-1k pretrained.

- Model card: https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k
- ONNX conversion: https://huggingface.co/onnx-community/mobilenetv3_small_100.lamb_in1k
- Pinned conversion revision: `b1a19675d33130739e56503b5bfd6534a0f9e01d`.
- Source: `onnx/model_quantized.onnx`, 2,728,398 bytes.
- Published source SHA256: `6e575dbe274417c0be6c0c851b6fd012732d924c3f63a6dfe70f602144783ec8` (verified before transformation).
- Derived `vision.onnx`: 1,076,542 bytes; SHA256 `7834fdfe40d883ecb2bf98c30b7d5698944ae20ea2d57061c82bd167686e1744`.

The original model has approximately 2.5 million parameters. We remove the ImageNet classifier and global pooling, expose the final 576×7×7 spatial feature map, fix the input to 1×3×224×224, and prune unused initializers. Pretrained backbone weights are frozen; the browser trains a separate approximately 15,500-parameter control head. This is a feature-extraction vision model, not a language model and not a pretrained Subway Surfers policy.

`LICENSE-APACHE-2.0` accompanies these weights. The conversion repository attributes the upstream timm model. ONNX Runtime Web 1.22.0 is MIT-licensed; its license is in `../vendor/ONNXRUNTIME-LICENSE`.

## Reproduce

Download the pinned source URL:

```
https://huggingface.co/onnx-community/mobilenetv3_small_100.lamb_in1k/resolve/b1a19675d33130739e56503b5bfd6534a0f9e01d/onnx/model_quantized.onnx
```

Install `onnx==1.18.0` in a development virtual environment, then run from `subway-no-coin`:

```
python scripts/prepare_vision_model.py /path/to/model_quantized.onnx
npm ci --ignore-scripts
npm run build
```

The preparation script rejects a different source checksum. The packaged extension makes no model-server requests at runtime.
