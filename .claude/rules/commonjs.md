---
paths:
  - "**/*.js"
---

# CommonJS Module Rules (SendReed Override)

This project uses CommonJS exclusively. The global rule preferring ES modules does NOT apply here.

- Use `require()` for imports, `module.exports` for exports
- Never use `import`/`export` syntax
- In browser JS (public/js/): use `var` (not let/const), `function` declarations (not arrows), `.then()` chains (not async/await)
- In server JS (services/, routes/, middleware/, db/): `var` or `const` acceptable, but `require`/`module.exports` mandatory
