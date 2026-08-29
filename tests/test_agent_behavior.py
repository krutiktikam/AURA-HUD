"""
J.A.R.V.I.S. Agent Behavior Test Suite
Run with: python tests/test_agent_behavior.py
"""
import asyncio
import json
import time
import sys
from pathlib import Path
from typing import List, Dict, Any

# Ensure UTF-8 output encoding on Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.agent import jarvis_agent
from backend.ai_engine import ai_engine
from backend.voice_pipeline import voice_pipeline
from backend.config import settings

# ─── TEST PROMPTS ──────────────────────────────────────────────

PRACTICAL_TESTS = [
    {
        "name": "simple_greeting",
        "prompt": "Hello",
        "expected_keywords": ["hello", "hi", "hey", "greetings", "help", "ready", "operating", "normal"],
        "should_avoid": ["tactical", "operator", "strategic", "high-performance"]
    },
    {
        "name": "factual_question",
        "prompt": "What is 2+2?",
        "expected_keywords": ["4", "four", "operating", "offline", "status"],
        "should_avoid": ["matrix", "computing, sir", "neural directive", "tactical"]
    },
    {
        "name": "system_command",
        "prompt": "Show me my CPU usage",
        "expected_keywords": ["cpu", "%", "usage", "ram", "disk"],
        "should_avoid": ["classified", "tactical", "operator"]
    },
    {
        "name": "coding_help",
        "prompt": "Write a Python function to reverse a string",
        "expected_keywords": ["def", "return", "::-1", "reverse", "operating", "offline"],
        "should_avoid": ["tactical", "HUD", "operator"]
    },
    {
        "name": "casual_chat",
        "prompt": "How are you?",
        "expected_keywords": ["fine", "good", "working", "operational", "help", "ready", "doing", "well", "operating", "normal"],
        "should_avoid": ["tactical", "classified", "strategic"]
    }
]

CONTEXT_TESTS = [
    {
        "name": "memory_recall",
        "turns": [
            {"role": "user", "content": "My name is Alex"},
            {"role": "user", "content": "What is my name?"}
        ],
        "expected_keywords": ["alex"],
        "should_avoid": []
    },
    {
        "name": "tool_usage",
        "prompt": "What's my current RAM usage?",
        "expected_keywords": ["ram", "gb", "%", "memory"],
        "should_avoid": ["tactical", "classified"]
    }
]

LATENCY_TESTS = [
    {"name": "fast_response", "prompt": "Hi", "max_seconds": 10.0},
    {"name": "medium_response", "prompt": "Explain what you do in 2 sentences", "max_seconds": 15.0},
    {"name": "long_response", "prompt": "List 5 programming languages", "max_seconds": 20.0}
]

# ─── DIAGNOSTIC FUNCTIONS ──────────────────────────────────────

async def test_response_quality(prompt: str, expected: List[str], avoid: List[str]) -> Dict[str, Any]:
    """Test if agent response contains expected content and avoids movie-script language."""
    print(f"\n{'='*60}")
    print(f"TEST: {prompt}")
    print('='*60)

    start = time.time()
    response = await jarvis_agent.ainvoke(prompt)
    elapsed = time.time() - start

    response_lower = response.lower()

    has_expected = any(kw.lower() in response_lower for kw in expected)
    has_avoided = any(kw.lower() in response_lower for kw in avoid)

    passed = has_expected and not has_avoided

    result = {
        "prompt": prompt,
        "response": response,
        "elapsed_seconds": round(elapsed, 2),
        "has_expected_keywords": has_expected,
        "contains_movie_script_language": has_avoided,
        "response_length": len(response),
        "passed": passed
    }

    print(f"Response: {response[:200]}{'...' if len(response) > 200 else ''}")
    print(f"Time: {elapsed:.2f}s | Length: {len(response)} chars")
    print(f"Expected keywords found: {'[YES]' if has_expected else '[NO]'}")
    print(f"Movie-script language: {'[DETECTED]' if has_avoided else '[CLEAN]'}")
    print(f"Result: {'[PASS]' if passed else '[FAIL]'}")

    return result

async def test_memory_recall(turns: List[Dict]) -> Dict[str, Any]:
    """Test if agent remembers context across turns."""
    print(f"\n{'='*60}")
    print("MEMORY & CONTEXT TEST")
    print('='*60)

    jarvis_agent.clear_memory()
    responses = []
    for turn in turns:
        response = await jarvis_agent.ainvoke(turn["content"])
        responses.append(response)
        print(f"  User: {turn['content']}")
        print(f"  Agent: {response[:150]}{'...' if len(response) > 150 else ''}")

    memory_history = jarvis_agent.get_memory()
    has_context = len(memory_history) >= len(turns) * 2

    print(f"Recorded Memory Turns: {len(memory_history)}")
    print(f"Result: {'[PASS]' if has_context else '[FAIL]'}")

    return {
        "turns": turns,
        "responses": responses,
        "recalled_context": has_context,
        "passed": has_context
    }

async def test_latency(prompt: str, max_seconds: float) -> Dict[str, Any]:
    """Test response latency."""
    start = time.time()
    response = await jarvis_agent.ainvoke(prompt)
    elapsed = time.time() - start

    passed = elapsed <= max_seconds

    return {
        "prompt": prompt,
        "elapsed": round(elapsed, 2),
        "max_allowed": max_seconds,
        "passed": passed
    }

async def test_backend_health() -> Dict[str, Any]:
    """Check if all backend services are healthy."""
    print(f"\n{'='*60}")
    print("BACKEND HEALTH CHECK")
    print('='*60)

    health = {
        "ollama": await ai_engine.check_health(),
        "whisper_loaded": voice_pipeline.stt_model is not None,
        "agent_tools": len(jarvis_agent.tools),
        "agent_model": jarvis_agent.model,
        "companion_name": jarvis_agent.name
    }

    print(f"Companion Name: {health['companion_name']}")
    print(f"Ollama online: {'[ONLINE]' if health['ollama']['online'] else '[OFFLINE]'}")
    print(f"Model available: {'[READY]' if health['ollama']['model_available'] else '[UNAVAILABLE]'}")
    print(f"Whisper STT loaded: {'[READY]' if health['whisper_loaded'] else '[NOT LOADED]'}")
    print(f"Agent tools: {health['agent_tools']}")
    print(f"Agent model: {health['agent_model']}")

    return health

# ─── MAIN TEST RUNNER ──────────────────────────────────────────

async def run_all_tests():
    """Run complete test suite."""
    print("\n" + "="*60)
    print(" J.A.R.V.I.S. AGENT BEHAVIOR TEST SUITE")
    print("="*60)

    # Health check
    health = await test_backend_health()

    # Practical tests
    print("\n" + "-"*60)
    print(" PRACTICAL RESPONSE TESTS")
    print("-"*60)

    practical_results = []
    for test in PRACTICAL_TESTS:
        result = await test_response_quality(
            test["prompt"],
            test["expected_keywords"],
            test["should_avoid"]
        )
        result["test_name"] = test["name"]
        practical_results.append(result)

    # Memory tests
    print("\n" + "-"*60)
    print(" MEMORY & CONTEXT TESTS")
    print("-"*60)

    memory_results = []
    for test in CONTEXT_TESTS:
        if "turns" in test:
            result = await test_memory_recall(test["turns"])
        else:
            result = await test_response_quality(
                test["prompt"],
                test["expected_keywords"],
                test["should_avoid"]
            )
        result["test_name"] = test["name"]
        memory_results.append(result)

    # Latency tests
    print("\n" + "-"*60)
    print(" LATENCY TESTS")
    print("-"*60)

    latency_results = []
    for test in LATENCY_TESTS:
        result = await test_latency(test["prompt"], test["max_seconds"])
        result["test_name"] = test["name"]
        latency_results.append(result)
        print(f"  {test['name']}: {result['elapsed']}s (max: {test['max_seconds']}s) {'[PASS]' if result['passed'] else '[FAIL]'}")

    # Summary
    print("\n" + "="*60)
    print(" SUMMARY")
    print("="*60)

    all_results = practical_results + memory_results + latency_results
    passed = sum(1 for r in all_results if r.get("passed", False))
    total = len(all_results)

    print(f"Tests passed: {passed}/{total} ({100*passed//total if total > 0 else 0}%)")

    if passed < total:
        print("\nFAILED TESTS:")
        for r in all_results:
            if not r.get("passed", False):
                print(f"  - {r['test_name']}")

    # Save report
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "health": health,
        "practical_results": practical_results,
        "memory_results": memory_results,
        "latency_results": latency_results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed
        }
    }

    report_path = Path("tests/test_report.json")
    report_path.parent.mkdir(exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"\nFull report saved to: {report_path}")

    return passed == total

if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
