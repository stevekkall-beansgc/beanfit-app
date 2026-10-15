// Generated from beanfit src/beanfit/catalog/on_device.json.
export const ON_DEVICE_CATALOG = {
  "schema": "beanfit.on-device.catalog.v1",
  "as_of": "2026-10-15",
  "runtime_revision": "2145525a4081d66ff1a87cf43ef809f95a85ac0c",
  "minimum_ios": 26,
  "native_context_tokens": 2048,
  "native_output_tokens": 256,
  "device_scope": "iPhone 14 and newer are evaluation targets, not qualified device families.",
  "artifact_scope": "Pinned weight components only; download sizes and q8 sizes are not measured RAM. Supporting assets may be additional.",
  "runtime_route": "Direct pinned Hugging Face artifacts for the embedded runtime. Ollama tags and MLX alternatives are intentionally omitted; no guessed aliases.",
  "trial_order_basis": "Editorial experiment ordering by experience, not benchmark quality, memory-fit ranking or a production recommendation.",
  "experiences": [
    {
      "id": "text_assistant",
      "name": "Chat, summaries and writing",
      "trial_order": [
        "liquid12",
        "qwen2",
        "liquid26",
        "qwen08",
        "liquid350",
        "liquid230"
      ],
      "fallback": "manual_editing"
    },
    {
      "id": "structured_extraction",
      "name": "Extract editable draft fields",
      "trial_order": [
        "liquid230",
        "liquid350",
        "qwen08",
        "liquid12",
        "qwen2",
        "liquid26"
      ],
      "fallback": "reviewed_manual_fields"
    },
    {
      "id": "shopping_filters",
      "name": "Shopping preference drafts",
      "trial_order": [
        "liquid230",
        "liquid12",
        "qwen2",
        "liquid26",
        "liquid350",
        "qwen08"
      ],
      "fallback": "reviewed_manual_filters_or_bounded_parser"
    },
    {
      "id": "image_description",
      "name": "Describe an image",
      "trial_order": [
        "liquidvl450"
      ],
      "fallback": "no_supported_runtime"
    },
    {
      "id": "transcription",
      "name": "Transcribe speech",
      "trial_order": [
        "moonshine_tiny",
        "moonshine_small"
      ],
      "fallback": "no_supported_runtime"
    },
    {
      "id": "speech_output",
      "name": "Read text aloud",
      "trial_order": [
        "kitten_nano",
        "supertonic2"
      ],
      "fallback": "system_speech_if_available"
    }
  ],
  "models": [
    {
      "id": "liquid230",
      "name": "LFM2.5 230M",
      "capabilities": [
        "text_assistant",
        "structured_extraction",
        "shopping_filters"
      ],
      "summary": "Smallest text trial for bounded extraction; broad reasoning and writing are limited.",
      "runtime_status": "native_text_candidate",
      "template": "lfm2",
      "license": "LFM Open License v1.0",
      "source_url": "https://huggingface.co/LiquidAI/LFM2.5-230M",
      "artifacts": [
        {
          "repository": "LiquidAI/LFM2.5-230M-GGUF",
          "revision": "03502067c64ce32ac4fe87b0cec0310a1a13d3e9",
          "filename": "LFM2.5-230M-Q4_K_M.gguf",
          "bytes": 153406304,
          "sha256": "7bbd90384d3deffe4c646ec9643b212802d32d4ce417c90a1ec9282100650062"
        }
      ],
      "q8_artifact": {
        "repository": "LiquidAI/LFM2.5-230M-GGUF",
        "revision": "03502067c64ce32ac4fe87b0cec0310a1a13d3e9",
        "filename": "LFM2.5-230M-Q8_0.gguf",
        "bytes": 246598496,
        "sha256": "855be85429300602eda72958547614703541b7d6dd965a8f8f6052b85a7aa935"
      },
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "liquid350",
      "name": "LFM2.5 350M QAD",
      "capabilities": [
        "text_assistant",
        "structured_extraction",
        "shopping_filters"
      ],
      "summary": "Historical phone baseline. Failed the frozen October 6 shopping task on the physical iPhone.",
      "runtime_status": "native_text_candidate",
      "template": "lfm2",
      "license": "LFM Open License v1.0",
      "source_url": "https://huggingface.co/LiquidAI/LFM2.5-350M",
      "artifacts": [
        {
          "repository": "LiquidAI/LFM2.5-350M-GGUF",
          "revision": "657e078c94084481950a2d555a941481f715536b",
          "filename": "LFM2.5-350M-QAD-Q4_0.gguf",
          "bytes": 219312832,
          "sha256": "3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d"
        }
      ],
      "q8_artifact": {
        "repository": "LiquidAI/LFM2.5-350M-GGUF",
        "revision": "657e078c94084481950a2d555a941481f715536b",
        "filename": "LFM2.5-350M-Q8_0.gguf",
        "bytes": 379217632,
        "sha256": "be036a757295e550098b85e13f6af2735d0fa73b41e1156a40c7d8e8e32a5766"
      },
      "failed_experiences": [
        "shopping_filters"
      ],
      "qualification": "unqualified",
      "failure_evidence_ref": "iphone/QUALIFICATION-RESULTS-2026-10-06.md"
    },
    {
      "id": "liquid12",
      "name": "LFM2.5 1.2B Instruct",
      "capabilities": [
        "text_assistant",
        "structured_extraction",
        "shopping_filters"
      ],
      "summary": "First general-text comparison candidate; device fit and task quality still need measurement.",
      "runtime_status": "native_text_candidate",
      "template": "lfm2",
      "license": "LFM Open License v1.0",
      "source_url": "https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct",
      "artifacts": [
        {
          "repository": "LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
          "revision": "8ed288026e23958ad9dfa92d53ed773a8eee7125",
          "filename": "LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
          "bytes": 730895168,
          "sha256": "b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5"
        }
      ],
      "q8_artifact": {
        "repository": "LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
        "revision": "8ed288026e23958ad9dfa92d53ed773a8eee7125",
        "filename": "LFM2.5-1.2B-Instruct-Q8_0.gguf",
        "bytes": 1246253888,
        "sha256": "f6b981dcb86917fa463f78a362320bd5e2dc45445df147287eedb85e5a30d26a"
      },
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "liquid26",
      "name": "LFM2.5 2.6B",
      "capabilities": [
        "text_assistant",
        "structured_extraction",
        "shopping_filters"
      ],
      "summary": "Pure reasoning model: its publisher template always starts a thinking block. Pocket needs reasoning-aware output handling and a separate token budget before this can be trialed.",
      "runtime_status": "requires_integration",
      "template": "lfm2_thinking",
      "license": "LFM Open License v1.0",
      "source_url": "https://huggingface.co/LiquidAI/LFM2.5-2.6B",
      "artifacts": [
        {
          "repository": "LiquidAI/LFM2.5-2.6B-GGUF",
          "revision": "e7caca5d835a3901a8e0d63e94009429bafafdfc",
          "filename": "LFM2.5-2.6B-Q4_K_M.gguf",
          "bytes": 1674455040,
          "sha256": "02a8b7e17487d326e46d68ce0ba24211e1b80a14c4cd0597fa73c1cd697f52ed"
        }
      ],
      "q8_artifact": {
        "repository": "LiquidAI/LFM2.5-2.6B-GGUF",
        "revision": "e7caca5d835a3901a8e0d63e94009429bafafdfc",
        "filename": "LFM2.5-2.6B-Q8_0.gguf",
        "bytes": 2874779648,
        "sha256": "1e22128dfa128bdfb684da167e74e072d0a056baa7d06d9f280291e2839b0fc9"
      },
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "qwen08",
      "name": "Qwen3.5 0.8B",
      "capabilities": [
        "text_assistant",
        "structured_extraction",
        "shopping_filters"
      ],
      "summary": "Historical text-only baseline. Failed the frozen October 6 shopping task in the simulator.",
      "runtime_status": "native_text_candidate",
      "template": "qwen",
      "license": "apache-2.0",
      "source_url": "https://huggingface.co/Qwen/Qwen3.5-0.8B",
      "artifacts": [
        {
          "repository": "unsloth/Qwen3.5-0.8B-GGUF",
          "revision": "6ab461498e2023f6e3c1baea90a8f0fe38ab64d0",
          "filename": "Qwen3.5-0.8B-Q4_K_M.gguf",
          "bytes": 532517120,
          "sha256": "bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517"
        }
      ],
      "q8_artifact": {
        "repository": "unsloth/Qwen3.5-0.8B-GGUF",
        "revision": "6ab461498e2023f6e3c1baea90a8f0fe38ab64d0",
        "filename": "Qwen3.5-0.8B-Q8_0.gguf",
        "bytes": 811843840,
        "sha256": "0ad885ffd4bb022fc4f0d33a3308fa108ef8613159d3b3a67e23abca056b7a6c"
      },
      "failed_experiences": [
        "shopping_filters"
      ],
      "qualification": "unqualified",
      "failure_evidence_ref": "iphone/QUALIFICATION-RESULTS-2026-10-06.md"
    },
    {
      "id": "qwen2",
      "name": "Qwen3.5 2B",
      "capabilities": [
        "text_assistant",
        "structured_extraction",
        "shopping_filters"
      ],
      "summary": "Broader text-quality comparison. This artifact is text-only in Pocket; vision needs an additional component and integration.",
      "runtime_status": "native_text_candidate",
      "template": "qwen",
      "license": "apache-2.0",
      "source_url": "https://huggingface.co/Qwen/Qwen3.5-2B",
      "artifacts": [
        {
          "repository": "unsloth/Qwen3.5-2B-GGUF",
          "revision": "f6d5376be1edb4d416d56da11e5397a961aca8ae",
          "filename": "Qwen3.5-2B-Q4_K_M.gguf",
          "bytes": 1280835840,
          "sha256": "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223"
        }
      ],
      "q8_artifact": {
        "repository": "unsloth/Qwen3.5-2B-GGUF",
        "revision": "f6d5376be1edb4d416d56da11e5397a961aca8ae",
        "filename": "Qwen3.5-2B-Q8_0.gguf",
        "bytes": 2012012800,
        "sha256": "1b04acba824817554f4ce23639bc8495ff70453b8fcb047900c731521021f2c1"
      },
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "liquidvl450",
      "name": "LFM2.5 VL 450M",
      "capabilities": [
        "image_description"
      ],
      "summary": "Compact image-captioning candidate; fine-grained OCR is outside the publisher recommendation. Requires a vision runtime.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "LFM Open License v1.0",
      "source_url": "https://huggingface.co/LiquidAI/LFM2.5-VL-450M",
      "artifacts": [
        {
          "repository": "LiquidAI/LFM2.5-VL-450M-GGUF",
          "revision": "1abed04b6fe71314d8c446a1371c03d7c332266d",
          "filename": "LFM2.5-VL-450M-Q4_K_M.gguf",
          "bytes": 229313568,
          "sha256": "1093f1331319199bbcacdbd7ecc9aa6e5678db6b55073948d0f508be90c8ab68"
        },
        {
          "repository": "LiquidAI/LFM2.5-VL-450M-GGUF",
          "revision": "1abed04b6fe71314d8c446a1371c03d7c332266d",
          "filename": "mmproj-LFM2.5-VL-450m-Q8_0.gguf",
          "bytes": 102815168,
          "sha256": "ebfc428baa37efad8bae93864f914b2634a09009f91ad59f974fe1a1565d8561"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "moonshine_tiny",
      "name": "Moonshine Streaming Tiny",
      "capabilities": [
        "transcription"
      ],
      "summary": "English streaming ASR. These are source weights, requiring a mobile-runtime export and tokenizer assets.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "mit",
      "source_url": "https://huggingface.co/moonshine-ai/moonshine-streaming-tiny",
      "artifacts": [
        {
          "repository": "moonshine-ai/moonshine-streaming-tiny",
          "revision": "f8e9dfd8c562c257c151a907b7b7f2fe8ff8511a",
          "filename": "model.safetensors",
          "bytes": 176237308,
          "sha256": "0ab3443dabd95a4afb35f0a26155428c03b7c3c450fa6923ffdac4510ba3d040"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "moonshine_small",
      "name": "Moonshine Streaming Small",
      "capabilities": [
        "transcription"
      ],
      "summary": "Larger English ASR quality comparison; requires a mobile-runtime export and tokenizer assets.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "mit",
      "source_url": "https://huggingface.co/moonshine-ai/moonshine-streaming-small",
      "artifacts": [
        {
          "repository": "moonshine-ai/moonshine-streaming-small",
          "revision": "2c036506f23a09c18df5a50057599ba6d9280999",
          "filename": "model.safetensors",
          "bytes": 560571228,
          "sha256": "003635df57b9a47771fd94a6290ab517d7487d0026c165ca9f2ac90411802646"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "kitten_nano",
      "name": "KittenTTS Nano 0.8 INT8",
      "capabilities": [
        "speech_output"
      ],
      "summary": "Compact speech-output candidate. Requires ONNX integration, voice assets and text preprocessing.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "apache-2.0",
      "source_url": "https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8",
      "artifacts": [
        {
          "repository": "KittenML/kitten-tts-nano-0.8-int8",
          "revision": "84781d74e29ee25217551556398b42f80593a813",
          "filename": "kitten_tts_nano_v0_8.onnx",
          "bytes": 24369971,
          "sha256": "f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "supertonic2",
      "name": "Supertonic 2",
      "capabilities": [
        "speech_output"
      ],
      "summary": "Five-language speech-output candidate. Requires all four ONNX components, voice assets and text preprocessing.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "openrail",
      "source_url": "https://huggingface.co/Supertone/supertonic-2",
      "artifacts": [
        {
          "repository": "Supertone/supertonic-2",
          "revision": "75e6727618a02f323c720cba9478152d4bc16ca4",
          "filename": "onnx/duration_predictor.onnx",
          "bytes": 1521526,
          "sha256": "6d556b3691165c364be91dc0bd894656b5949f5acd2750d8ec2f954010845011"
        },
        {
          "repository": "Supertone/supertonic-2",
          "revision": "75e6727618a02f323c720cba9478152d4bc16ca4",
          "filename": "onnx/text_encoder.onnx",
          "bytes": 27431318,
          "sha256": "dd5f535ed629f7df86071043e15f541ce1b2ab7f1bdbce4c7892b307bca79fa3"
        },
        {
          "repository": "Supertone/supertonic-2",
          "revision": "75e6727618a02f323c720cba9478152d4bc16ca4",
          "filename": "onnx/vector_estimator.onnx",
          "bytes": 132471364,
          "sha256": "105e9d66fd8756876b210a6b4aa03fc393b1eaca3a8dadcc8d9a3bc785c86a35"
        },
        {
          "repository": "Supertone/supertonic-2",
          "revision": "75e6727618a02f323c720cba9478152d4bc16ca4",
          "filename": "onnx/vocoder.onnx",
          "bytes": 101405066,
          "sha256": "19bd51f47a186069c752403518a40f7ea4c647455056d2511f7249691ecddf7c"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified"
    }
  ],
  "devices": [
    {
      "id": "iPhone14,7",
      "name": "iPhone 14"
    },
    {
      "id": "iPhone14,8",
      "name": "iPhone 14 Plus"
    },
    {
      "id": "iPhone15,2",
      "name": "iPhone 14 Pro"
    },
    {
      "id": "iPhone15,3",
      "name": "iPhone 14 Pro Max"
    },
    {
      "id": "iPhone15,4",
      "name": "iPhone 15"
    },
    {
      "id": "iPhone15,5",
      "name": "iPhone 15 Plus"
    },
    {
      "id": "iPhone16,1",
      "name": "iPhone 15 Pro"
    },
    {
      "id": "iPhone16,2",
      "name": "iPhone 15 Pro Max"
    },
    {
      "id": "iPhone17,3",
      "name": "iPhone 16"
    },
    {
      "id": "iPhone17,4",
      "name": "iPhone 16 Plus"
    },
    {
      "id": "iPhone17,1",
      "name": "iPhone 16 Pro"
    },
    {
      "id": "iPhone17,2",
      "name": "iPhone 16 Pro Max"
    },
    {
      "id": "iPhone17,5",
      "name": "iPhone 16e"
    },
    {
      "id": "iPhone18,3",
      "name": "iPhone 17"
    },
    {
      "id": "iPhone18,1",
      "name": "iPhone 17 Pro"
    },
    {
      "id": "iPhone18,2",
      "name": "iPhone 17 Pro Max"
    },
    {
      "id": "iPhone18,4",
      "name": "iPhone Air"
    },
    {
      "id": "iPhone18,5",
      "name": "iPhone 17e"
    },
    {
      "id": "iPhone19,2",
      "name": "iPhone 18 Pro"
    },
    {
      "id": "iPhone19,3",
      "name": "iPhone 18 Pro Max"
    },
    {
      "id": "iPhone19,7",
      "name": "iPhone 18 Pro Max"
    }
  ],
  "device_source": {
    "url": "https://github.com/devicekit/DeviceKit/blob/4548e5a9f2410c04d3c06754b43b8891c7d86425/Source/Device.generated.swift",
    "scope": "Hardware identifier/name mapping only; no memory or performance qualification."
  }
};
