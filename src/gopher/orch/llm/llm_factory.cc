// LLM Provider Factory Implementation

#include "gopher/orch/llm/llm_provider.h"
#include "gopher/orch/llm/openai_provider.h"
#include "gopher/orch/llm/anthropic_provider.h"

namespace gopher {
namespace orch {
namespace llm {

LLMProviderPtr createProvider(const ProviderConfig& config) {
  switch (config.type) {
    case ProviderType::OPENAI: {
      OpenAIConfig openai_config(config.api_key);
      if (!config.base_url.empty()) {
        openai_config.withBaseUrl(config.base_url);
      }
      return OpenAIProvider::create(openai_config);
    }

    case ProviderType::ANTHROPIC: {
      AnthropicConfig anthropic_config(config.api_key);
      if (!config.base_url.empty()) {
        anthropic_config.withBaseUrl(config.base_url);
      }
      return AnthropicProvider::create(anthropic_config);
    }

    case ProviderType::OLLAMA: {
      // Ollama uses OpenAI-compatible API
      OpenAIConfig ollama_config("");
      ollama_config.withBaseUrl(
          config.base_url.empty() ? "http://localhost:11434/v1" : config.base_url);
      return OpenAIProvider::create(ollama_config);
    }

    case ProviderType::CUSTOM: {
      // For custom providers, use OpenAI-compatible API by default
      OpenAIConfig custom_config(config.api_key);
      if (!config.base_url.empty()) {
        custom_config.withBaseUrl(config.base_url);
      }
      return OpenAIProvider::create(custom_config);
    }

    default:
      return nullptr;
  }
}

LLMProviderPtr createOllamaProvider(const std::string& base_url) {
  ProviderConfig config(ProviderType::OLLAMA);
  config.base_url = base_url.empty() ? "http://localhost:11434/v1" : base_url;
  return createProvider(config);
}

}  // namespace llm
}  // namespace orch
}  // namespace gopher
