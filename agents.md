# AGENTS.md

## Working rules

- Read the current code before changing it.
- Make the smallest change necessary for the requested task.
- Do not invent requirements, abstractions or architecture.
- Do not refactor unrelated code.
- Prefer simple, explicit and readable code.
- Follow the existing project structure and naming.
- Use descriptive names.
- Controllers should only handle HTTP concerns and delegate to services.
- Services contain application/business logic.
- Repositories handle persistence.
- Use specific DTOs for different inputs and outputs when needed.
- Create mappers only when they actually simplify conversions.
- Use `this.` consistently for instance fields.
- Do not create interfaces, factories, ports, adapters or patterns without a concrete need.
- Add or update tests for changed behavior.
- Run the relevant formatter, static checks and tests before finishing.
- Do not weaken quality checks to make code pass.
- Do not commit or push unless explicitly requested.