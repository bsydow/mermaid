---
'mermaid': minor
---

Add Domain Storytelling diagram type (beta)

Adds Domain Storytelling as a new diagram type to Mermaid (available as `domainstorytelling-beta`). Domain Storytelling, developed by Stefan Hofer and Henning Schwentner, is a collaborative modeling technique from Domain-Driven Design where domain experts tell stories about their work and software teams listen to understand the domain.

Features:

- Actors (people, systems, organizations) rendered as labeled icon nodes with Font Awesome icons
- Work objects (documents, data, interfaces) rendered as labeled icon nodes with Font Awesome icons
- Numbered activity arrows between actors and work objects forming a readable story sequence
- Annotations with bracket-shaped callout pointers for contextual notes
- Groups/swimlanes for organizing actors into bounded contexts or organizational units
- Per-declaration icon assignment: fallback defaults (`fa:fa-user`, `fa:fa-file`) with inline override per actor/workobject declaration
- Full dagre layout with configurable rank direction (LR/RL/TB/BT), node and rank spacing
- Sequence number circles positioned along activity arrows
- Complete theme integration across all five mermaid themes: actor, workobject, and sequence-circle colors adapt per theme via dedicated `domainstorytellingActorColor`, `domainstorytellingWorkobjectColor`, `domainstorytellingSequenceColor` theme variables
- Schema-driven configuration: `rankdir`, `nodeSpacing`, `rankSpacing`, `ranker`, `diagramPadding`, `useMaxWidth`

This brings Domain Storytelling into Mermaid's text-based DSL ecosystem, making it easy to version-control and share domain stories alongside code.

Implementation includes a Langium grammar, parser, renderer using the new rendering-util/render pipeline, unit tests, Cypress e2e tests, and documentation.
