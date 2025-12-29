/**
 * @file ffi_json_test.cc
 * @brief Unit tests for FFI JSON handling
 *
 * Tests:
 * - JsonImpl (Null, Object, Array)
 * - IteratorImpl (ObjectIteration, ArrayIteration)
 */

#include "gopher/orch/ffi/orch_ffi_bridge.h"
#include "gopher/orch/ffi/orch_ffi_types.h"
#include "orch_test_fixture.h"

using namespace gopher::orch::ffi;

// =============================================================================
// Test Fixture for FFI JSON Tests
// =============================================================================

class FFIJsonTest : public OrchTest {
 protected:
  void SetUp() override {
    OrchTest::SetUp();
    ErrorManager::ClearError();
  }

  void TearDown() override {
    ErrorManager::ClearError();
    OrchTest::TearDown();
  }
};

// =============================================================================
// JsonImpl Tests
// =============================================================================

TEST_F(FFIJsonTest, JsonImplNull) {
  auto* json = new JsonImpl(core::JsonValue::null());
  EXPECT_TRUE(json->value.isNull());
  json->Release();
}

TEST_F(FFIJsonTest, JsonImplObject) {
  auto* json = new JsonImpl(core::JsonValue::object());
  EXPECT_TRUE(json->value.isObject());
  json->value["key"] = core::JsonValue("value");
  EXPECT_EQ(json->value["key"].getString(), "value");
  json->Release();
}

TEST_F(FFIJsonTest, JsonImplArray) {
  auto* json = new JsonImpl(core::JsonValue::array());
  EXPECT_TRUE(json->value.isArray());
  json->value.push_back(core::JsonValue(1));
  json->value.push_back(core::JsonValue(2));
  EXPECT_EQ(json->value.size(), 2);
  json->Release();
}

// =============================================================================
// IteratorImpl Tests
// =============================================================================

TEST_F(FFIJsonTest, IteratorImplObjectIteration) {
  auto* json = new JsonImpl(core::JsonValue::object());
  json->value["a"] = core::JsonValue(1);
  json->value["b"] = core::JsonValue(2);

  auto* iter = new IteratorImpl(reinterpret_cast<gopher_orch_json_t>(json));
  EXPECT_EQ(iter->GetType(), GOPHER_ORCH_TYPE_ITERATOR);
  EXPECT_TRUE(iter->is_object_);
  EXPECT_EQ(iter->object_keys_.size(), 2);

  iter->Release();
  json->Release();
}

TEST_F(FFIJsonTest, IteratorImplArrayIteration) {
  auto* json = new JsonImpl(core::JsonValue::array());
  json->value.push_back(core::JsonValue(1));
  json->value.push_back(core::JsonValue(2));
  json->value.push_back(core::JsonValue(3));

  auto* iter = new IteratorImpl(reinterpret_cast<gopher_orch_json_t>(json));
  EXPECT_FALSE(iter->is_object_);
  EXPECT_EQ(iter->array_size_, 3);

  iter->Release();
  json->Release();
}
