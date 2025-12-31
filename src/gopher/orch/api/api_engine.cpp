#include "gopher/orch/api/api_engine.h"
#include <sstream>

namespace gopher {
namespace orch {
namespace api {

std::string ApiEngine::fetchComposite(const std::string& namespace_str) {
    std::string endpoint = "/api/v1/composite/" + namespace_str;
    
    ApiResponse response = get(endpoint);
    
    if (!response.isSuccess()) {
        std::stringstream error_msg;
        error_msg << "Failed to fetch composite for namespace '" << namespace_str 
                  << "': " << response.error_message
                  << " (HTTP " << response.status_code << ")";
        throw std::runtime_error(error_msg.str());
    }
    
    return response.body;
}

} // namespace api
} // namespace orch
} // namespace gopher