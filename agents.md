# Project Guidelines

This is an academic Distributed Systems project.

Prioritize simple, explicit implementations that are easy to understand and explain.

## Working Style

Work in small increments.

Before implementing a significant change:
1. inspect the relevant code;
2. explain the current flow briefly;
3. discuss the decision and its main trade-off;
4. implement only the agreed scope.

Prefer short and focused code changes.

Do not introduce abstractions, patterns, frameworks, or infrastructure unless the current requirement clearly needs them.

## Environment

Focus on the local development environment.

Prefer solutions that are easy to run, inspect, debug, and reproduce locally.

Do not introduce production-oriented complexity unless explicitly requested.

## Code

Keep responsibilities clear and names explicit.

Follow the conventions already present in the project.

Avoid unrelated refactors.

When multiple solutions are valid, prefer the simplest one that satisfies the current requirement.

## Verification

Test the changed behavior locally.

Run only the relevant tests or commands first.

Explain failures before making broader changes.

## Git

Never commit, push, merge, or create remote changes unless explicitly requested.

The user must review the code before any commit is made.

## Learning

The user must remain able to understand and explain the implementation.

Do not make large batches of changes that hide how the system works.

When a change introduces an important concept, explain it briefly before moving forward.