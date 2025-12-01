## OrgDiff

OrgDiff is a web tool that helps Salesforce developers **compare and synchronize metadata between two orgs** (typically sandboxes) without constantly changing the CLI default org.

The app focuses on:
- **Exploring metadata types and components** side by side between two orgs.
- **Opening precise diffs** of individual components.
- **Marking components that exist only in Org A** so they can later be deployed to Org B.

The UI is built with **Vanilla JavaScript** and the backend is a small **Node.js + Express** server that delegates all org access to the **Salesforce CLI (`sf`)**.

---

## Main features

- **Org selection and validation**
  - Loads the list of authorized orgs via `sf org list --json`.
  - Lets you pick **Org A** and **Org B** and validates both with `sf org display --target-org "<alias>" --json`.
  - In dev mode, it can auto-select test orgs to speed up local development.

- **Metadata types TreeView**
  - Lists **all metadata types** available in each org via `sf org list metadata-types`.
  - Shows the **union** of types from both orgs (no duplicates).
  - If the number of types differs by more than 10%, it displays a warning about possible **missing types due to permissions/config**.

- **On‑demand component loading**
  - Expanding a type (for example `ApexClass`) triggers `sf org list metadata --metadata-type <type> --target-org "<alias>"` for both orgs.
  - Only **names and basic metadata** are loaded initially (no full file content).
  - Results are cached in memory to avoid reloading the same type.

- **Per‑component diff viewer**
  - For components that exist in **both orgs**, you can click the row to open a **side‑by‑side diff**.
  - The diff loads the **real content from each org** only when needed.
  - Supports multiple editors behind the scenes (e.g. Monaco / CodeMirror), but this is transparent for the user.

- **Components that exist only in Org A**
  - Components present in **Org A but not in Org B** are shown with symbol **`A`**.
  - You can **click these rows to toggle a selection**:
    - Selected components are visually highlighted and their symbol changes (direction from **A → B**).
    - A global **“Review changes”** panel lists all components that:
      - Have been synchronized from A to B via the diff workflow, and/or
      - Are **marked to be deployed** from Org A to Org B in a future deploy step.
  - The actual deployment execution is not yet implemented, but the **selection and review flow is already in place**.

---

## How it works (high level)

1. **Backend**
   - Node.js + Express REST API.
   - Uses `sf` CLI commands with `--target-org "<alias>"` so it never needs to change the global default org.
   - A dedicated service module encapsulates all CLI calls.

2. **Frontend**
   - Pure JavaScript (ES6 modules) + a custom **TreeView** for metadata types and components.
   - A diff viewer surface that opens when you select a specific component.
   - Local storage is used to cache the org list and some UI preferences (like the active diff editor).

3. **Performance strategy**
   - Only metadata **types** are loaded upfront.
   - Component **names only** are fetched on demand per type.
   - Full component content is fetched **only** when opening the diff for that component.

---

## Requirements

- **Node.js** (LTS recommended).
- **Salesforce CLI (`sf`)** installed and configured.
- At least **two authorized orgs** in your local CLI (for example sandboxes).

You can verify your orgs with:

```bash
sf org list --json
```

---

## Installation and usage

From the root of the repository:

```bash
# Install dependencies
npm install

# Development mode (with watch / hot reload where applicable)
npm run dev

# Production mode
npm start
```

By default the app runs on `http://localhost:3200`.

1. Open the browser at that URL.
2. Select **Org A** and **Org B** and click **Continue**.
3. Explore metadata types in the left TreeView.
4. Expand a type to see its components and:
   - Click components that exist in both orgs to **open a diff**.
   - Click components with symbol **`A`** (only in Org A) to **mark/unmark them for future deploy**.
5. Use **“Review changes”** (top right) to see a consolidated list of:
   - Components synchronized from A to B via the diff workflow.
   - Components only in A that you have marked for deploy.

---

## Notes

- OrgDiff is designed for **interactive exploration and comparison**, not for bulk unattended migrations.
- The **deploy step** for selected components is intentionally kept as a future phase; today the focus is on **discovering differences** and **pre‑selecting what should move from A to B**.
- All CLI operations are executed using **org aliases** and `--target-org` to keep your global CLI configuration untouched.
