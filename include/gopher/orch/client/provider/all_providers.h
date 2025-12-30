#pragma once

// Convenience header to include all provider implementations

#include "gopher/orch/client/provider/provider_base.h"
#include "gopher/orch/client/provider/anthropic_provider.h"
#include "gopher/orch/client/provider/openai_provider.h"
#include "gopher/orch/client/provider/google_provider.h"
#include "gopher/orch/client/provider/llama_provider.h"

namespace gopher {
namespace orch {
namespace client {
namespace provider {

// Factory function to create provider by name
inline ProviderPtr createProvider(const std::string& name) {
    if (name == "anthropic" || name == "claude") {
        return std::make_shared<AnthropicProvider>();
    } else if (name == "openai" || name == "gpt") {
        return std::make_shared<OpenAIProvider>();
    } else if (name == "google" || name == "gemini") {
        return std::make_shared<GoogleProvider>();
    } else if (name == "llama" || name == "meta") {
        return std::make_shared<LlamaProvider>();
    }
    return nullptr;
}

// Get list of all available provider names
inline std::vector<std::string> getAvailableProviders() {
    return {"anthropic", "openai", "google", "llama"};
}

}  // namespace provider
}  // namespace client
}  // namespace orch
}  // namespace gopher