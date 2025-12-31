#include "gopher/orch/api/async_api_engine.h"
#include "production_api_engine.h"

namespace gopher {
namespace orch {
namespace api {

std::shared_ptr<AsyncApiEngine> makeProductionApiEngine() {
    auto sync_engine = std::make_shared<ProductionApiEngine>();
    return std::make_shared<AsyncApiEngine>(sync_engine);
}

}  // namespace api
}  // namespace orch
}  // namespace gopher