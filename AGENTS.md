# OrgDiff - Guide for AI Agents

## Project Overview

OrgDiff is a web tool developed with Node.js + Express (backend) and Vanilla JavaScript (frontend) that allows comparing metadata between two Salesforce orgs. The tool is designed to facilitate the management and synchronization of metadata between different orgs, typically between sandboxes.

### Main Purpose

Enable Salesforce developers to:
- Compare metadata types and components between two orgs
- Visualize differences between specific components
- Manage and resolve differences between orgs
- Deploy components from one org to another
- All without needing to constantly change the CLI default org

## Architecture

### Backend
- **Node.js + Express**: Web server that exposes REST APIs
- **Salesforce CLI**: All commands are executed through the `sf` CLI (assumes it's installed and configured)
- **Service module**: `src/services/salesforce.js` abstracts CLI command execution

### Frontend
- **Vanilla JavaScript**: No frameworks, pure JavaScript with ES6 modules
- **Monaco Editor**: For code diff visualization (prepared for future phases)
- **Custom TreeView**: Own implementation to display metadata types and components

## Application Flow

### Step 1: Org Selection
1. The application automatically loads the list of available orgs using `sf org list --json`
2. **Auto-selection of test orgs**: If the orgs "DEVSERVICE" and "Vodafone - dev11pro" exist in the list, they are automatically selected:
   - **DEVSERVICE** → automatically selected in **Org A**
   - **Vodafone - dev11pro** → automatically selected in **Org B**
3. The user can modify the selection if desired
4. When clicking "Continue":
   - Validates that the orgs are different
   - Validates that both orgs are accessible using `sf org display --target-org "<alias>" --json`
   - If any org is not accessible (expired, no permissions, etc.), an error is shown
   - If both orgs are valid, proceed to the next step

### Step 2: Metadata Types Visualization
1. Metadata types are loaded for **both orgs** in parallel using `sf org list metadata-types --target-org "<alias>" --json`
2. Metadata types are **compared** between the two orgs:
   - If there's a significant difference (more than 10% difference), a **warning** is shown indicating that some metadata types may not be visible due to insufficient permissions or configuration differences
   - The warning shows which org has more types and the percentage difference
3. A **treeview** is rendered with the **union** of all metadata types from both orgs (no duplicates)
4. Each metadata type appears as an **expandable node** (folder)
5. When expanding a node (e.g., ApexClass):
   - A loading indicator is shown
   - A call is made to `/api/metadata/:orgAlias/:metadataType` which executes `sf org list metadata --metadata-type <type> --target-org "<alias>" --json`
   - Components are rendered as **leaf nodes** (children of the metadata type)
   - Components are cached to avoid unnecessary reloads

### Step 3: Comparison and Management (Future Phases)
- Visualizing differences using Monaco Editor diff viewer
- Deploying components from one org to another
- Conflict resolution
- Filtering and search

## Performance Strategy

**CRITICAL**: The tool is designed to be efficient and not require long waits:

1. **Fast initial listing**: Only metadata types are listed (without content)
2. **On-demand loading**: Components are loaded only when the user expands a type
3. **Names only**: When expanding, only names and basic metadata are obtained, NOT the complete content
4. **Complete content**: Complete content is downloaded only when the user opens the diff of a specific component

This strategy avoids having to wait hours downloading all metadata before being able to work.

## Salesforce CLI Commands Used

### `sf org list --json`
Lists all orgs authorized in the CLI. Does not require `--target-org`.

### `sf org display --target-org "<alias>" --json`
Validates that an org is accessible. Used to verify that selected orgs work before continuing.

### `sf org list metadata-types --target-org "<alias>" --json`
Gets all metadata types available in an org. **Critical** because it returns all types, including those that may appear in future Salesforce releases.

### `sf org list metadata --metadata-type <type> --target-org "<alias>" --json`
Lists only component names of a specific type (without complete content). **Critical performance optimization**.

## Using --target-org

**IMPORTANT**: All commands that require a specific org use `--target-org "<alias>"` (with quotes to handle spaces). This allows:
- Executing commands in different orgs without changing the CLI default org
- Avoiding having to constantly change and restore configuration
- Working with multiple orgs simultaneously

## Project Structure

```
OrgDiff/
├── package.json              # Dependencies and scripts
├── server.js                 # Express server
├── README.md                 # General project documentation
├── AGENTS.md                 # This file (guide for AI agents)
├── CONTEXT.md                # Detailed technical documentation for AI agents
├── public/                   # Frontend static files
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js            # Main logic
│       ├── treeView.js       # TreeView module
│       └── diffViewer.js    # Monaco Editor module (future phases)
├── src/                      # Backend code
│   └── services/
│       └── salesforce.js     # Service to execute CLI commands
└── tmp/                      # Temporary files (scripts, diagrams, images, extensive markdown)
```

## Critical Rules for AI Agents

### ⚠️ Temporary Files - ABSOLUTE RULE

**ANY temporary file MUST ALWAYS be created in the `tmp/` folder**

This includes:
- Temporary scripts
- Generated diagrams
- Created images
- Extensive Markdown files to save information
- Any file that is not part of the permanent source code

**DO NOT create temporary files outside of `tmp/`**. This avoids scattering files throughout the project.

### Code Conventions
- Code in English (variable names, functions, classes)
- Comments in English
- Use camelCase for names
- ES6 modules (import/export)

### Tool Preferences
- **Always prefer MCP tools over direct CLI commands** when possible
- For example: use `executeQuery` from the Salesforce MCP server instead of `sf data query`
- Use Github MCP tools instead of direct git commands

## API Endpoints

### `GET /api/orgs`
Gets the list of orgs authorized in the CLI.

**Response**:
```json
{
  "success": true,
  "orgs": [
    {
      "alias": "DEVSERVICE",
      "username": "user@example.com",
      "orgId": "00D...",
      "instanceUrl": "https://...",
      "isDefaultUsername": false
    }
  ]
}
```

### `GET /api/orgs/validate/:orgAlias`
Validates that an org is accessible and not expired.

**Response**:
```json
{
  "success": true,
  "org": {
    "alias": "DEVSERVICE",
    "username": "user@example.com",
    "orgId": "00D...",
    "instanceUrl": "https://..."
  }
}
```

### `GET /api/metadata-types/:orgAlias`
Gets the metadata types available in an org.

**Response**:
```json
{
  "success": true,
  "metadataTypes": [
    {
      "metadataType": "ApexClass",
      "directoryName": "classes"
    }
  ]
}
```

### `GET /api/metadata/:orgAlias/:metadataType`
Gets the list of components of a specific metadata type (names only, without content).

**Response**:
```json
{
  "success": true,
  "components": [
    {
      "fullName": "MyClass",
      "type": "ApexClass"
    }
  ]
}
```

## Installation and Execution

```bash
# Install dependencies
npm install

# Run in development mode (with watch)
npm run dev

# Run in production
npm start
```

The server runs on `http://localhost:3200` by default.

## Current Project Status

### ✅ Implemented
- Org selection with validation
- **Auto-selection of test orgs** (DEVSERVICE and Vodafone - dev11pro)
- Org access validation
- Metadata types TreeView
- **Metadata types comparison between orgs with warning** if there are significant differences (indicates possible types hidden by permissions)
- On-demand component loading
- Performance optimization (names only, not content)
- Org cache in localStorage for fast initial load

### 🚧 Future Phases
- Visual component comparison using Monaco Editor diff viewer
- Component deployment from one org to another
- Conflict resolution
- Filtering and search of metadata types and components
- Difference export

## Recently Added Features

### Auto-selection of Test Orgs
To speed up testing during development, the application now automatically selects the following orgs if they are available in the list:
- **DEVSERVICE** → automatically selected in **Org A**
- **Vodafone - dev11pro** → automatically selected in **Org B**

This functionality is implemented in the `populateOrgSelects()` function in the `public/js/app.js` file. Automatic selection occurs after populating the dropdowns, and the user can modify the selection if desired.

### Detection of Metadata Types Hidden by Permissions
The application now automatically compares the number of metadata types between the two selected orgs. If it detects a significant difference (more than 10% difference), it shows a warning indicating that some metadata types may not be visible due to insufficient permissions or configuration differences between the orgs.

**Implementation:**
- Metadata types from both orgs are loaded in parallel
- The number of returned types is compared
- If the difference is greater than 10%, a warning with details is shown
- The treeview shows the union of all metadata types from both orgs (no duplicates)

This functionality is implemented in the `checkMetadataTypesDifference()` function in the `public/js/app.js` file.

## Dependencies

- **express**: Web framework for the server
- **monaco-editor**: VS Code code editor with diff viewer support

## Prerequisites

- Node.js installed
- Salesforce CLI (`sf`) installed and configured
- At least two orgs authorized in the CLI

## Notes for Developers

- The project assumes Salesforce CLI is installed and configured
- All operations use `--target-org` to avoid changing the default org
- Performance strategy is critical: only load what's necessary when necessary
- The treeview caches loaded components to avoid unnecessary reloads
- Orgs are cached in localStorage for faster initial load
- Auto-selection of test orgs facilitates development and testing

## Error Handling

All endpoints return consistent JSON responses:
- `success: true` when the operation is successful
- `success: false` when there's an error, along with a descriptive message

Frontend errors are shown in an `errorMessage` element that automatically hides after 5 seconds.

## Performance Considerations

1. **Don't download all content at once**: Only component names are downloaded when a type is expanded
2. **Component cache**: Already loaded components are kept in memory to avoid reloads
3. **Org cache**: The org list is saved in localStorage for fast initial load
4. **Parallel validation**: Org validations are done in parallel using `Promise.all()`


