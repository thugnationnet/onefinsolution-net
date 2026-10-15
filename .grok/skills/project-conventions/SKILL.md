---
name: project-conventions
description: Core coding standards, folder structure, and preferred patterns for this chatbot-template project. Use whenever writing, reviewing, or refactoring code in this repo.
when-to-use: new feature, code review, refactor, create component, add API route, style code
user-invocable: true
---

# Project Conventions – chatbot-template

Follow these rules strictly when working in this repository.

## Tech Stack & Structure
- Use the existing tech stack and folder layout already present in the project.
- Prefer existing patterns over inventing new ones.
- Keep components small and focused.

## Code Style
- Write clean, readable, and well-commented code.
- Match the existing naming conventions (files, functions, variables).
- Prefer TypeScript if the project already uses it.
- Avoid unnecessary dependencies.

## When Creating New Features
1. Look at similar existing features first.
2. Reuse components, hooks, and utilities when possible.
3. Keep UI consistent with the current design system / styles.
4. Add proper error handling and loading states.
5. Make sure the code works with the existing chatbot flow.

## Output Expectations
- Always show the final code ready to paste.
- Prefer minimal, focused changes.
- Explain briefly only when the change is non-obvious.
