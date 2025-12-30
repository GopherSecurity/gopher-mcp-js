#pragma once

// Backward compatibility header
// Includes all providers from the new structure

#include "gopher/orch/client/provider/all_providers.h"

namespace gopher {
namespace orch {
namespace client {

// Import provider namespace for backward compatibility
using namespace provider;

}  // namespace client
}  // namespace orch
}  // namespace gopher