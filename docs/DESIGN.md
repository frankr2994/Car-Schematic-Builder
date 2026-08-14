# Canonical Model and Architecture

## Principal Entities

### Catalog
- **ComponentDefinition**: The definition of a component in the catalog.
- **PortDefinition**: The definition of a terminal/port on a component.
- **CircuitTemplate**: A template defining intents and roles rather than fixed component IDs.
- **SymbolDefinition**: The graphical symbol for a component.

### Electrical Project
- **ComponentInstance**: A concrete component placed in a project.
- **Terminal**: A specific connection point on an instance.
- **Net**: A set of terminals connected together.
- **Wire**: A physical conductor connecting two terminals.
- **Splice**: A point where multiple wires connect.
- **GroundPoint**: A connection to the vehicle chassis.
- **Connector**: A multi-pin connector linking harnesses.
- **ProtectionDevice**: Fuses, breakers, or fusible links.

### Presentation
- **VehicleZone**: A semantic physical area (Engine Bay, Dash, Trunk).
- **Placement**: A coordinate and rotation for a component.
- **RouteOverride**: A manual path for a wire.
- **Page**: A printable area.
- **LabelPlacement**: The position of a text label.

### Persistence
- **ProjectDocument**: The root container for a project.
- **Revision**: A snapshot of the project document.
- **SchemaVersion**: The version of the JSON schema.
- **RuleSetVersion**: The version of electrical rules used.

## Architecture

- **Frontend**: Next.js (App Router), React, TailwindCSS.
- **Electrical Model**: Pure TypeScript structures representing the netlist, independent of the UI.
- **Layout**: ELK layered algorithm (elkjs) for automatic placement and routing, executing in a web worker or asynchronously.
- **Interactive UI**: React Flow for viewing and interacting with the components and wires.
- **Rendering**: Deterministic SVG rendering for print output, mimicking 60s/70s service manual styles.
- **Database**: PostgreSQL for accounts, projects, revisions (to be added later in development).
