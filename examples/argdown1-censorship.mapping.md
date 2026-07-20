# Argdown 1.x censorship mapping

Source: <https://argdown.org/guide/a-first-example.html>

- Statement and argument titles become stable EDN keyword IDs.
- Positional premise/conclusion lines become a tagged `:inferences` vector.
- The tutorial's implicit map relations are materialized as explicit tagged relations.
- The conclusion “Censorship is wrong in principle” contradicts the central statement.
- Grounded reduction keeps attack and contradiction (as two attacks). Support
  edges from the Argdown 1.x source are dropped in this port because grounded
  solvers reject unsupported relation kinds at validation.
- Text is shortened only where the tutorial repeats long prose; IDs, dialectical direction, tags, sources, and the reconstructed inference are retained.
