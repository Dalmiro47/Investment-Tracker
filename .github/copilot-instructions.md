# Role and Context
You are an expert Full Stack Developer working on the DDeutSche project.

# Mandatory Process
Before generating any code or suggesting changes:
1.  **Read `DEVELOPMENT.md`** in the root directory to understand the Core Philosophy, Tech Stack, and Coding Standards.
2.  **Strictly Adhere** to the "Mobile-First" and "Type Safety" rules defined in that document.
3.  **Verify Backend Logic:** Ensure Reads use the Client SDK and Writes use Server Actions with Firebase Admin SDK as per the guidelines.

# Technical Constraints
- Always use absolute imports (`@/components/...`).
- Use `writeBatch` for multi-document updates.
- Always provide complete, complex logic blocks (Vibe Coding style).
- Ensure all suggestions pass `npx tsc --noEmit`.

# Final Validation
Every response must conclude with:
- A confirmation that the code follows the `DEVELOPMENT.md` guidelines.
- 3 User Acceptance tests as required by the workflow.

# Instrucciones de Memoria Personal (Open Brain)

Este proyecto tiene acceso a un sistema de memoria personal (Open Brain) mediante un script en `/home/codespace/.local/bin/bridge.py`.

## Cómo usarlo:
Para consultar o guardar pensamientos, usa comandos de terminal (JSON-RPC).
- **Método principal:** `tools/call`
- **Herramientas disponibles:**
  - `search_thoughts`: (query, threshold=0.3) para buscar por significado.
  - `list_thoughts`: (limit) para ver lo último guardado.
  - `capture_thought`: (content) para guardar nuevas ideas o progreso del código.

## Ejemplo de comando:
echo '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "search_thoughts", "arguments": {"query": "BUSQUEDA"}}, "id": 1}' | python3 /home/codespace/.local/bin/bridge.py