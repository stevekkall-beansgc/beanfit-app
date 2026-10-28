// Generated from beanfit src/beanfit/catalog/on_device.json.
export const ON_DEVICE_CATALOG = {
  "schema": "beanfit.on-device.catalog.v1",
  "as_of": "2026-10-23",
  "runtime_revision": "2145525a4081d66ff1a87cf43ef809f95a85ac0c",
  "minimum_ios": 26,
  "native_context_tokens": 2048,
  "native_output_tokens": 256,
  "device_scope": "iPhone 14 and newer are evaluation targets, not qualified device families.",
  "artifact_scope": "Pinned model components only; download sizes and q8 sizes are not measured RAM. Core ML entries count the listed compiled models, vocabulary, configuration and notices. Supporting assets and search indexes may be additional.",
  "runtime_route": "Direct pinned Hugging Face artifacts for the embedded runtime. Ollama tags and MLX alternatives are intentionally omitted; no guessed aliases.",
  "trial_order_basis": "Editorial trial order informed by available task evidence; not a measured memory-fit ranking or production qualification.",
  "experiences": [
    {
      "id": "text_assistant",
      "name": "Short text summaries and writing",
      "trial_order": [
        "qwen2",
        "qwen08",
        "liquid350",
        "liquid230",
        "liquid12",
        "liquid26"
      ],
      "fallback": "manual_editing",
      "summary": "Start the next short-English summary/rewrite comparison with Qwen3.5 2B. Earlier LFM1.2B text configurations failed factual acceptance and remain held. Pocket has preliminary Qwen2 resource evidence; final phone quality and sustained heat checks remain pending. Reply drafts remain a separate unreleased native pilot, not a qualified model capability."
    },
    {
      "id": "transcription",
      "name": "Voice notes and dictation",
      "trial_order": [
        "fluid_speech_mini",
        "moonshine_tiny",
        "moonshine_small"
      ],
      "fallback": "no_supported_runtime",
      "summary": "Prepare offline English voice notes with Fluid Speech Mini first, with Moonshine as a comparison. Microphone and speech-runtime integration are still needed."
    },
    {
      "id": "semantic_search",
      "name": "Search saved notes and content",
      "trial_order": [
        "embeddinggemma300"
      ],
      "fallback": "keyword_search_or_manual_browsing",
      "summary": "Prepare search across saved notes and content by meaning with EmbeddingGemma 300M. Embedding and local-index integration are still needed; keyword search remains the fallback."
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
      "id": "speech_output",
      "name": "Read text aloud",
      "trial_order": [
        "kitten_nano",
        "supertonic3",
        "supertonic2"
      ],
      "fallback": "system_speech_if_available"
    },
    {
      "id": "decision_classification",
      "name": "Categories, choices and simple scores",
      "trial_order": [
        "d1_omni600"
      ],
      "fallback": "reviewed_manual_choices"
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
      "summary": "Earlier short-text configuration failed factual acceptance on the test iPhone; held for this experience until a revised configuration passes review. Other tasks still need their own evidence.",
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
      "failed_experiences": [
        "text_assistant"
      ],
      "qualification": "unqualified",
      "failure_evidence_ref": "iphone/evidence/2026-10-22-acceptance/pocket-liquid12-initial-authored-review.json"
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
      "summary": "Current summary/rewrite comparison candidate, not a qualified selection. Preliminary Pocket resource checks passed on iPhone 14 Pro Max; full quality, sustained heat and final-build lifecycle tests remain pending. Text-only runtime; vision needs additional integration.",
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
    },
    {
      "id": "fluid_speech_mini",
      "name": "Fluid Speech Mini Core ML",
      "capabilities": [
        "transcription"
      ],
      "summary": "First voice-note integration candidate: English dictation using a published Core ML package. Requires microphone, audio processing and Swift app integration. Publisher Mac memory and speed results are not iPhone measurements.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "cc-by-4.0",
      "source_url": "https://huggingface.co/FluidVoice-Labs/fluid-speech-mini-coreml",
      "artifacts": [
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Decoder.mlmodelc/analytics/coremldata.bin",
          "bytes": 243,
          "sha256": "d4beee43a6eab29b2adcc298f2e8582e8fb79d5fe3aa9f1ab692ade681ca369d"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Decoder.mlmodelc/coremldata.bin",
          "bytes": 491,
          "sha256": "6094d06d05c1ca4599c7b13c9a4ca7c00826ee2396796cf3084ce602a9884468"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Decoder.mlmodelc/metadata.json",
          "bytes": 3373,
          "sha256": "13fcb358af8b028703dc7f424fd149ce9524642de510f3d682b75d471b1a001d"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Decoder.mlmodelc/model.mil",
          "bytes": 13411,
          "sha256": "4ccd8ecbc7eb59bed7ad38d471bf6b78ef52a24500bf64619c549ed45fbee4e9"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Decoder.mlmodelc/weights/weight.bin",
          "bytes": 11845120,
          "sha256": "d173e381488d07fd7648e2ccecbfb1bceff0457d75461550b26ba7fa2d23309a"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Encoder.mlmodelc/analytics/coremldata.bin",
          "bytes": 243,
          "sha256": "3a3caa2c6aec983d94a5659eff09a00f77077147ea6726b8ddfdf022f0238ce9"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Encoder.mlmodelc/coremldata.bin",
          "bytes": 427,
          "sha256": "494d8e2ce30b37bcdf494b3ba7ddf6e1bc921b9a59e369a9efd44d013ca3bf7d"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Encoder.mlmodelc/metadata.json",
          "bytes": 2906,
          "sha256": "1a2229e2cc4c271e4876715c9e36aef18bc7287e35690022c7f3939d85260ea9"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Encoder.mlmodelc/model.mil",
          "bytes": 712643,
          "sha256": "f96b7707936ea7ce5517c5b0f5c15cc634006bc58af1fe2587ac5979dd180343"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Encoder.mlmodelc/weights/weight.bin",
          "bytes": 233096704,
          "sha256": "cf0b61022de8c698984a8c7185c2d093fa744694621881ff062c46fee2546131"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "JointDecision.mlmodelc/analytics/coremldata.bin",
          "bytes": 243,
          "sha256": "9e767d69e1092b27b28d9f236b9cbcded58ff3891e320cba7855e2c24e803d69"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "JointDecision.mlmodelc/coremldata.bin",
          "bytes": 462,
          "sha256": "284b235c08cd4769202af017f854deace69c0209c29f2253a2073bb68d58d38d"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "JointDecision.mlmodelc/metadata.json",
          "bytes": 2790,
          "sha256": "fe1ce083f9ff57524926a92fc264b0cf7d88f3ba9852f7acf9f59dcdf427e01f"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "JointDecision.mlmodelc/model.mil",
          "bytes": 7547,
          "sha256": "1109ce72f6d014a6b99e49b41e83b3082d7555d74a6275838e7cbea42a6bd0ee"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "JointDecision.mlmodelc/weights/weight.bin",
          "bytes": 6350284,
          "sha256": "f991f65979c1b3fee3db39a645aa87e6bef1a304ed1816d074b17479bea797fc"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Preprocessor.mlmodelc/analytics/coremldata.bin",
          "bytes": 243,
          "sha256": "c9beeb989c8d66f8be11df59bc6df277ec76cee404f6865b46243835ef562f6d"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Preprocessor.mlmodelc/coremldata.bin",
          "bytes": 486,
          "sha256": "dbde3f2300842c1fd51ef3ff948a0bcffe65ffd2dca10707f2509f32c1d65b1d"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Preprocessor.mlmodelc/metadata.json",
          "bytes": 2841,
          "sha256": "2a98699e22d279dd37fa1d238aeb1c6db1df0d6fad687775324157689d8f3acf"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Preprocessor.mlmodelc/model.mil",
          "bytes": 28181,
          "sha256": "4b8518a956450fec57f06c2a21bdffc26973f7f1fa6842fb38fe917f896b6b93"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "Preprocessor.mlmodelc/weights/weight.bin",
          "bytes": 491072,
          "sha256": "129b76e3aeafa8afa3ea76d995b964b145fe83700d579f6ff42c4c38fa0968ea"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "config.json",
          "bytes": 314,
          "sha256": "5e6e1189fd8e9da59633b929a977c716d696b84aff6ab9b040423bc8b9c8b3be"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "parakeet_v3_vocab.json",
          "bytes": 151122,
          "sha256": "7ec60e05f1b24480736ec0eed40900f4626bce1fa9a60fd700ec7e2a59198735"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "parakeet_vocab.json",
          "bytes": 151122,
          "sha256": "7ec60e05f1b24480736ec0eed40900f4626bce1fa9a60fd700ec7e2a59198735"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "LICENSE",
          "bytes": 18657,
          "sha256": "9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411"
        },
        {
          "repository": "FluidVoice-Labs/fluid-speech-mini-coreml",
          "revision": "d81c3160dfe5a5e1f8f7267164a07d30617a3a1a",
          "filename": "NOTICE",
          "bytes": 690,
          "sha256": "05119420d65cf41d7434a83027c23f1360740d7e8c25d6b47263698ffe1f4c86"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "embeddinggemma300",
      "name": "EmbeddingGemma 300M Q8",
      "capabilities": [
        "semantic_search"
      ],
      "summary": "First search integration candidate: find saved notes and content by meaning. Requires embeddings, chunking and a local index; index storage and working memory are additional. Gemma terms apply.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "gemma",
      "source_url": "https://huggingface.co/google/embeddinggemma-300m",
      "artifacts": [
        {
          "repository": "ggml-org/embeddinggemma-300M-GGUF",
          "revision": "0f741b5a6585bd53aeb15cd1372c56f2a0f65e12",
          "filename": "embeddinggemma-300M-Q8_0.gguf",
          "bytes": 333590944,
          "sha256": "b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "d1_omni600",
      "name": "d1 Omni 600M Q8",
      "capabilities": [
        "decision_classification"
      ],
      "summary": "Early research candidate for named choices, yes/no answers and scores over text, an image or an audio clip. Both Q8 components are counted. Requires decision-head and media integration; this is not chat generation or transcription.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "LFM Open License v1.0",
      "source_url": "https://huggingface.co/LiquidAI/d1-omni-600M-GGUF",
      "artifacts": [
        {
          "repository": "LiquidAI/d1-omni-600M-GGUF",
          "revision": "8eb2d2a1c5404bba8a34a88bd8e159c242197d51",
          "filename": "d1-omni-600M-Q8_0.gguf",
          "bytes": 407207584,
          "sha256": "cd94463f4cac9c700ec6750df8df005bb6846de410e159d1f5e985e1171693d3"
        },
        {
          "repository": "LiquidAI/d1-omni-600M-GGUF",
          "revision": "8eb2d2a1c5404bba8a34a88bd8e159c242197d51",
          "filename": "mmproj-d1-omni-600M-Q8_0.gguf",
          "bytes": 262791232,
          "sha256": "df887978550cdbb45f0f57d7b436a0f844689f9f561395a144ced500606c3a89"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified"
    },
    {
      "id": "supertonic3",
      "name": "Supertonic 3",
      "capabilities": [
        "speech_output"
      ],
      "summary": "31-language speech-output comparison. Requires all four ONNX components, voice styles and text preprocessing. Larger download than Supertonic 2; quality and device fit need comparison.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "openrail",
      "source_url": "https://huggingface.co/Supertone/supertonic-3",
      "artifacts": [
        {
          "repository": "Supertone/supertonic-3",
          "revision": "3cadd1ee6394adea1bd021217a0e650ede09a323",
          "filename": "onnx/duration_predictor.onnx",
          "bytes": 3700147,
          "sha256": "c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db"
        },
        {
          "repository": "Supertone/supertonic-3",
          "revision": "3cadd1ee6394adea1bd021217a0e650ede09a323",
          "filename": "onnx/text_encoder.onnx",
          "bytes": 36416150,
          "sha256": "c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff"
        },
        {
          "repository": "Supertone/supertonic-3",
          "revision": "3cadd1ee6394adea1bd021217a0e650ede09a323",
          "filename": "onnx/vector_estimator.onnx",
          "bytes": 256534781,
          "sha256": "883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c"
        },
        {
          "repository": "Supertone/supertonic-3",
          "revision": "3cadd1ee6394adea1bd021217a0e650ede09a323",
          "filename": "onnx/vocoder.onnx",
          "bytes": 101424195,
          "sha256": "085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba"
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
  },
  "reference_models": [
    {
      "id": "gemma4_e2b_reference",
      "name": "Gemma 4 E2B QAT Q4_0",
      "capabilities": [
        "text_assistant",
        "image_description",
        "transcription"
      ],
      "summary": "Mac-first text, image and audio-understanding comparison. Both decoder and media components are counted; E2B is an effective parameter label, not a 2 GB package. No iPhone recommendation.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "apache-2.0",
      "source_url": "https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf",
      "artifacts": [
        {
          "repository": "google/gemma-4-E2B-it-qat-q4_0-gguf",
          "revision": "675cff42a74c774d6cb76f76d8eacb49b48c9b93",
          "filename": "gemma-4-E2B_q4_0-it.gguf",
          "bytes": 3349516256,
          "sha256": "fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634"
        },
        {
          "repository": "google/gemma-4-E2B-it-qat-q4_0-gguf",
          "revision": "675cff42a74c774d6cb76f76d8eacb49b48c9b93",
          "filename": "gemma-4-E2B-it-mmproj.gguf",
          "bytes": 986833664,
          "sha256": "021059cce659fe7f9170d5599761d7bbaf644b798dab9503aca30dc43e6beb14"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified",
      "evaluation_scope": "mac_reference_only"
    },
    {
      "id": "liquid24_reference",
      "name": "LFM2.5 24B-A2B MLX 4-bit",
      "capabilities": [
        "text_assistant"
      ],
      "summary": "Larger text-quality reference for an Apple Silicon Mac. All three weight shards are required; 2B active parameters does not give a 2B download. Not an iPhone candidate.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "LFM Open License v1.0",
      "source_url": "https://huggingface.co/LiquidAI/LFM2.5-24B-A2B-MLX-4bit",
      "artifacts": [
        {
          "repository": "LiquidAI/LFM2.5-24B-A2B-MLX-4bit",
          "revision": "667408d494bde191c2cb9dd4f4549827816b9275",
          "filename": "model-00001-of-00003.safetensors",
          "bytes": 5318453801,
          "sha256": "17e953456c62314a498f1ef5ee8a5f1b51ac83f6b6bb684f160dde4f92cd11c0"
        },
        {
          "repository": "LiquidAI/LFM2.5-24B-A2B-MLX-4bit",
          "revision": "667408d494bde191c2cb9dd4f4549827816b9275",
          "filename": "model-00002-of-00003.safetensors",
          "bytes": 5344895125,
          "sha256": "c3ae09dba31b3786c325425435021cf5d5bf06c1a79acb31a741e15a47e5bb14"
        },
        {
          "repository": "LiquidAI/LFM2.5-24B-A2B-MLX-4bit",
          "revision": "667408d494bde191c2cb9dd4f4549827816b9275",
          "filename": "model-00003-of-00003.safetensors",
          "bytes": 2903945409,
          "sha256": "9814144af5045ea8c96e2f1352148fdbe9f8a0085b76df6d6760efbe916e9840"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified",
      "evaluation_scope": "mac_reference_only"
    },
    {
      "id": "embeddinggemma2_reference",
      "name": "EmbeddingGemma 2",
      "capabilities": [
        "semantic_search"
      ],
      "summary": "Mac-first multimodal search reference with text, image, audio and video embeddings. Full published weights are counted. Text-only selective loading is possible, but no phone export is verified.",
      "runtime_status": "requires_integration",
      "template": "",
      "license": "apache-2.0",
      "source_url": "https://huggingface.co/google/embeddinggemma-2",
      "artifacts": [
        {
          "repository": "google/embeddinggemma-2",
          "revision": "914f7f89142e33e77833254d9c9b90c3cef7303b",
          "filename": "model.safetensors",
          "bytes": 1488915288,
          "sha256": "197a32965d4b1105faf060417baa899e193fb73cd401f42ec9295234d5553d79"
        }
      ],
      "q8_artifact": null,
      "failed_experiences": [],
      "qualification": "unqualified",
      "evaluation_scope": "mac_reference_only"
    }
  ],
  "reference_scope": "Mac-first research comparisons only. Excluded from all iPhone candidate lists and runnable trial orders; no measured memory-fit or quality rating is assigned.",
  "mac_recommendations": {
    "schema": "beanfit.mac.recommendations.v1",
    "as_of": "2026-10-28",
    "selection_basis": "Published evaluations determine capability recommendations; no local model benchmark is required.",
    "scope": "Apple Silicon Mac model choices by role. These are model recommendations, not an automatic device memory-fit decision.",
    "limits": [
      "Independent results are identified separately from publisher-reported evaluations.",
      "Compare benchmark versions, reasoning modes and agent harnesses before comparing scores.",
      "Artifact bytes describe weight files, not loaded memory. Context, runtime and concurrent workloads add memory.",
      "This web catalog does not scan your Mac or know which models are installed.",
      "The legacy eight-model Mac fit engine and previously paired recommendation snapshots are separate and are not refreshed by this page.",
      "Mac recommendations do not remove the iPhone native release hold."
    ],
    "models": [
      {
        "id": "qwen38_27b_mac",
        "name": "Qwen3.8 27B",
        "role": "Primary Mac assistant",
        "decision": "Keep as the primary choice for writing, reasoning, coding and image understanding.",
        "runtime_status": "publisher_supported_mlx",
        "format": "MLX 4-bit",
        "license": "Apache-2.0",
        "source_url": "https://huggingface.co/Qwen/Qwen3.8-27B",
        "artifacts": [
          {
            "repository": "lmstudio-community/Qwen3.8-27B-MLX-4bit",
            "revision": "6067b15cf581666a4aecf6af3afaba4bb5efc20c",
            "filename": "model-00001-of-00003.safetensors",
            "bytes": 5343268752,
            "sha256": "471a9a81b54dddbfef43e8a71960ca24ad3c727891c6b0750a9db9a214aab504"
          },
          {
            "repository": "lmstudio-community/Qwen3.8-27B-MLX-4bit",
            "revision": "6067b15cf581666a4aecf6af3afaba4bb5efc20c",
            "filename": "model-00002-of-00003.safetensors",
            "bytes": 5354185100,
            "sha256": "e7474b8f968f4078dfd4889925961c5b0da9939219b614dba08eb63c46590de7"
          },
          {
            "repository": "lmstudio-community/Qwen3.8-27B-MLX-4bit",
            "revision": "6067b15cf581666a4aecf6af3afaba4bb5efc20c",
            "filename": "model-00003-of-00003.safetensors",
            "bytes": 5357087747,
            "sha256": "1038989bed1346ecdb541a45c078df2aae99a9509f35bfd51e7a04802a5d8402"
          }
        ],
        "limitations": "Published evaluations cover the original model and their stated reasoning settings; the exact 4-bit conversion has no separate quality result here. Image input also requires a compatible vision runtime.",
        "evidence": [
          {
            "kind": "publisher",
            "url": "https://huggingface.co/Qwen/Qwen3.8-27B",
            "summary": "Broad capability results support retaining this as the primary model; no universal win over every specialist is claimed.",
            "benchmarks": [
              "GPQA Diamond",
              "IFBench",
              "LiveCodeBench v6",
              "SWE-bench Pro"
            ],
            "reviewed_on": "2026-10-28"
          },
          {
            "kind": "independent",
            "url": "https://artificialanalysis.ai/models/qwen3-8-27b",
            "summary": "Independent evaluation of the xhigh reasoning mode supports broad capability. Hosted speed is not Mac throughput.",
            "benchmarks": [
              "Artificial Analysis Intelligence Index v5.0"
            ],
            "reviewed_on": "2026-10-28"
          }
        ]
      },
      {
        "id": "lfm25_24b_mac",
        "name": "LFM2.5 24B-A2B",
        "role": "Fast agents and tool use",
        "decision": "Add for workflows that call tools or retrieve information. Keep Qwen3.8 for broad knowledge tasks.",
        "runtime_status": "publisher_supported_mlx",
        "format": "MLX 4-bit",
        "license": "LFM Open License v1.0",
        "source_url": "https://huggingface.co/LiquidAI/LFM2.5-24B-A2B",
        "artifacts": [
          {
            "repository": "LiquidAI/LFM2.5-24B-A2B-MLX-4bit",
            "revision": "667408d494bde191c2cb9dd4f4549827816b9275",
            "filename": "model-00001-of-00003.safetensors",
            "bytes": 5318453801,
            "sha256": "17e953456c62314a498f1ef5ee8a5f1b51ac83f6b6bb684f160dde4f92cd11c0"
          },
          {
            "repository": "LiquidAI/LFM2.5-24B-A2B-MLX-4bit",
            "revision": "667408d494bde191c2cb9dd4f4549827816b9275",
            "filename": "model-00002-of-00003.safetensors",
            "bytes": 5344895125,
            "sha256": "c3ae09dba31b3786c325425435021cf5d5bf06c1a79acb31a741e15a47e5bb14"
          },
          {
            "repository": "LiquidAI/LFM2.5-24B-A2B-MLX-4bit",
            "revision": "667408d494bde191c2cb9dd4f4549827816b9275",
            "filename": "model-00003-of-00003.safetensors",
            "bytes": 2903945409,
            "sha256": "9814144af5045ea8c96e2f1352148fdbe9f8a0085b76df6d6760efbe916e9840"
          }
        ],
        "limitations": "Always generates reasoning before its answer. Publisher throughput of 184 tokens/s used llama.cpp Q4_K_M at a 4K-token context on an M5 Max; it is not an MLX or end-to-end latency result. The license has commercial conditions.",
        "evidence": [
          {
            "kind": "publisher",
            "url": "https://huggingface.co/LiquidAI/LFM2.5-24B-A2B",
            "summary": "Publisher comparisons support this task-specific choice; it leads some tool-use tasks and trails competitors on others.",
            "benchmarks": [
              "AutomationBench",
              "BFCLv4",
              "ToolSandbox",
              "LiveClaw",
              "WebArena Verified"
            ],
            "reviewed_on": "2026-10-28"
          }
        ]
      },
      {
        "id": "qwen3_4b_instruct_mac",
        "name": "Qwen3 4B Instruct-2507",
        "role": "Lightweight text available now",
        "decision": "Retain as the smaller option for an existing MLX setup while LFM3 support matures.",
        "runtime_status": "publisher_supported_mlx",
        "format": "MLX 4-bit",
        "license": "Apache-2.0",
        "source_url": "https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507",
        "artifacts": [
          {
            "repository": "mlx-community/Qwen3-4B-Instruct-2507-4bit",
            "revision": "50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b",
            "filename": "model.safetensors",
            "bytes": 2263022417,
            "sha256": "2a73c6c248601ab904e035548abd8e6abb65ea27dcb5f342fb0a8910eb44173f"
          }
        ],
        "limitations": "A practical continuity choice, not a claim that it wins current compact-model benchmarks. Weight size does not establish latency or memory fit.",
        "evidence": [
          {
            "kind": "publisher",
            "url": "https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507",
            "summary": "Publisher reports instruction-following, knowledge and coding evaluations for this instruction-tuned model.",
            "benchmarks": [
              "IFEval",
              "MMLU-Pro",
              "LiveCodeBench v6"
            ],
            "reviewed_on": "2026-10-28"
          }
        ]
      },
      {
        "id": "lfm3_17b_mac",
        "name": "LFM3 1.7B",
        "role": "Compact structured tasks \u2014 awaiting runtime support",
        "decision": "Preferred compact addition for structured outputs and tool use once the selected runtime supports it.",
        "runtime_status": "awaiting_runtime_support",
        "format": "MLX 4-bit (support in progress)",
        "license": "LFM Open License v1.0",
        "source_url": "https://huggingface.co/LiquidAI/LFM3-1.7B",
        "artifacts": [
          {
            "repository": "LiquidAI/LFM3-1.7B-MLX-4bit",
            "revision": "d0ca73dcfa70ce18733754a492cdc1fb0123262d",
            "filename": "model.safetensors",
            "bytes": 973083386,
            "sha256": "1be5bf672013cd91aa62148f77c5eea8d2784a95845d5fe826e08c7b84823815"
          }
        ],
        "limitations": "The publisher says MLX support is still in progress. GGUF requires an LFM3-compatible llama.cpp build. It is not recommended for agentic coding or complex multi-step reasoning. Its iPhone 17 Pro results do not qualify an iPhone 14 Pro Max.",
        "evidence": [
          {
            "kind": "publisher",
            "url": "https://huggingface.co/LiquidAI/LFM3-1.7B",
            "summary": "Publisher results on public benchmarks support a compact structured-task role; independent corroboration was not established in this review.",
            "benchmarks": [
              "BFCL V4",
              "ToolSandbox",
              "Multi-IF",
              "IFEval"
            ],
            "reviewed_on": "2026-10-28"
          },
          {
            "kind": "runtime_status",
            "url": "https://huggingface.co/LiquidAI/LFM3-1.7B-MLX-4bit",
            "summary": "The model card explicitly marks MLX support as in progress.",
            "benchmarks": [],
            "reviewed_on": "2026-10-28"
          }
        ]
      }
    ]
  },
  "native_release_hold": {
    "status": "held",
    "as_of": "2026-10-25",
    "summary": "Native text distribution is held: the CPU-only Qwen3.5 2B runtime exceeded the heat limit on the iPhone 14 Pro Max. Mac recommendations do not establish phone readiness.",
    "evidence_url": "https://github.com/stevekkall-beansgc/beanfit/blob/ec0c82958e45e87b80d357179ba7081538242783/iphone/evidence/2026-10-25-phone/README.md"
  }
};
