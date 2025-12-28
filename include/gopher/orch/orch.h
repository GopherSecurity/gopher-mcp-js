#pragma once

// gopher-orch - MCP Server Orchestration Framework
//
// Provides composable building blocks for agentic workflows:
// - Runnable<I, O>: Universal async operation interface
// - Sequence, Parallel, Router: Composition patterns
// - StateGraph: Stateful workflow graphs (Pregel model)
// - StateMachine: Entity lifecycle management (FSM)
// - Server: Protocol-agnostic server abstraction
// - Resilience: Retry, Timeout, Fallback, CircuitBreaker
//
// Design principles:
// - Async-first with dispatcher-based callbacks
// - Type-safe with C++14 compatibility
// - Protocol-agnostic (MCP, REST, mock)
// - Explicit - no hidden magic

// Core types and utilities
#include "gopher/orch/core/config.h"
#include "gopher/orch/core/lambda.h"
#include "gopher/orch/core/runnable.h"
#include "gopher/orch/core/types.h"

// Composition patterns
#include "gopher/orch/composition/parallel.h"
#include "gopher/orch/composition/router.h"
#include "gopher/orch/composition/sequence.h"

// Resilience patterns
#include "gopher/orch/resilience/circuit_breaker.h"
#include "gopher/orch/resilience/fallback.h"
#include "gopher/orch/resilience/retry.h"
#include "gopher/orch/resilience/timeout.h"

// Graph patterns
#include "gopher/orch/graph/state_graph.h"

// Finite State Machine
#include "gopher/orch/fsm/state_machine.h"

// Callback system (Observability)
#include "gopher/orch/callback/callback_handler.h"
#include "gopher/orch/callback/callback_manager.h"

// Human-in-the-Loop
#include "gopher/orch/human/approval.h"

// Server abstraction
#include "gopher/orch/server/mock_server.h"
#include "gopher/orch/server/server.h"
#include "gopher/orch/server/server_composite.h"

// MCP Server and REST Server (require gopher-mcp dependency)
// Conditionally included to avoid hard dependency
#ifdef GOPHER_ORCH_WITH_MCP
#include "gopher/orch/server/mcp_server.h"
#include "gopher/orch/server/rest_server.h"
#endif

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
using composition::parallel;
using composition::ParallelBuilder;
using composition::Router;
using composition::router;
using composition::RouterBuilder;
using composition::Sequence;
using composition::sequence;
using composition::Sequence2;
using composition::SequenceBuilder;

// Re-export resilience patterns
using resilience::CircuitBreaker;
using resilience::CircuitBreakerPolicy;
using resilience::CircuitState;
using resilience::Fallback;
using resilience::FallbackBuilder;
using resilience::JsonCircuitBreaker;
using resilience::JsonFallback;
using resilience::JsonRetry;
using resilience::JsonTimeout;
using resilience::Retry;
using resilience::RetryPolicy;
using resilience::Timeout;
using resilience::withCircuitBreaker;
using resilience::withFallback;
using resilience::withRetry;
using resilience::withTimeout;

// Re-export graph patterns
using graph::ChannelConfig;
using graph::CompiledStateGraph;
using graph::GraphNode;
using graph::GraphState;
using graph::GraphStateCallback;
using graph::StateChannel;
using graph::StateGraph;
namespace reducers = graph::reducers;  // Namespace alias for reducers

// Re-export FSM components
using fsm::makeStateMachine;
using fsm::StateMachine;
using fsm::StateMachineBuilder;

// Re-export callback system components
using callback::CallbackHandler;
using callback::CallbackManager;
using callback::ChainGuard;
using callback::EventType;
using callback::LoggingCallbackHandler;
using callback::NoOpCallbackHandler;
using callback::RunInfo;
using callback::ToolGuard;

// Re-export human-in-the-loop components
using human::ApprovalHandler;
using human::ApprovalRequest;
using human::ApprovalResponse;
using human::AsyncCallbackApprovalHandler;
using human::AutoApprovalHandler;
using human::AutoDenyHandler;
using human::CallbackApprovalHandler;
using human::ConditionalApprovalHandler;
using human::HumanApproval;
using human::JsonHumanApproval;
using human::RecordingApprovalHandler;

// Re-export server components
using server::ConnectionCallback;
using server::ConnectionState;
using server::makeMockServer;
using server::MockServer;
using server::Server;
using server::ServerComposite;
using server::ServerCompositePtr;
using server::ServerPtr;
using server::ServerTool;
using server::ServerToolPtr;
using server::ToolInfo;
using server::ToolListCallback;
using server::ToolMapping;

// MCP Server and REST Server exports (conditional)
#ifdef GOPHER_ORCH_WITH_MCP
using server::HttpClient;
using server::HttpMethod;
using server::HttpResponse;
using server::makeRESTServer;
using server::MCPServer;
using server::MCPServerConfig;
using server::MCPServerPtr;
using server::RESTServer;
using server::RESTServerConfig;
using server::RESTServerPtr;
#endif

}  // namespace orch
}  // namespace gopher
