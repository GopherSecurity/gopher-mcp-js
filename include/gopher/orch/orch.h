#pragma once

// gopher-orch - MCP Server Orchestration Framework
//
// Provides composable building blocks for agentic workflows:
// - Runnable<I, O>: Universal async operation interface
// - Sequence, Parallel: Composition patterns
// - Server: Protocol-agnostic server abstraction
// - Resilience: Retry, Timeout, Fallback, CircuitBreaker
//
// Design principles:
// - Async-first with dispatcher-based callbacks
// - Type-safe with C++14 compatibility
// - Protocol-agnostic (MCP, REST, mock)
// - Explicit - no hidden magic

// Core types and utilities
#include "gopher/orch/core/types.h"
#include "gopher/orch/core/config.h"
#include "gopher/orch/core/runnable.h"
#include "gopher/orch/core/lambda.h"

// Composition patterns
#include "gopher/orch/composition/sequence.h"
#include "gopher/orch/composition/parallel.h"

// Server abstraction
#include "gopher/orch/server/server.h"
#include "gopher/orch/server/mock_server.h"

// Convenience namespace imports
namespace gopher {
namespace orch {

// Re-export core types at orch level
using core::Dispatcher;
using core::Error;
using core::JsonCallback;
using core::JsonRunnable;
using core::JsonRunnablePtr;
using core::JsonValue;
using core::Lambda;
using core::makeJsonLambda;
using core::makeLambda;
using core::makeLambdaAsync;
using core::makeOrchError;
using core::makeSuccess;
using core::nullopt;
using core::optional;
namespace OrchError = core::OrchError;  // Namespace alias
using core::Result;
using core::ResultCallback;
using core::Runnable;
using core::RunnableConfig;

// Re-export composition patterns
using composition::Parallel;
using composition::ParallelBuilder;
using composition::parallel;
using composition::Sequence;
using composition::Sequence2;
using composition::SequenceBuilder;
using composition::sequence;

// Re-export server components
using server::ConnectionCallback;
using server::ConnectionState;
using server::makeMockServer;
using server::MockServer;
using server::Server;
using server::ServerPtr;
using server::ServerTool;
using server::ServerToolPtr;
using server::ToolInfo;
using server::ToolListCallback;

}  // namespace orch
}  // namespace gopher
