# Configuración del Técnico (Hermes Agent) — precisión, enfoque y eficiencia de tokens

> **Estado: redactado, pendiente de aplicar en el VPS.** Sesión del 2026-08-16.
> Ver `ESTADO-PROYECTO.md`, punto 12, para el contexto completo del Agente Técnico.

## Objetivos

1. **Precisión y enfoque**: el Técnico solo audita los 4 workflows del Data Agent de Spectrum, nada más.
2. **No consumir tokens de más**: prompt conciso + tools restringidas (33→9) + reasoning bajo.
3. **Solo atender los flujos del Data Agent**: alcance acotado explícitamente en el system prompt.

## Qué se puede hacer desde WebUI vs CLI

| Cambio | WebUI | CLI/SSH |
|---|---|---|
| `SOUL.md` (system prompt) | ✅ Memory → Agent Soul → lápiz | — |
| `tools.include` (MCP solo lectura) | ❌ (Plugins no es MCP, Session toolsets sin confirmar) | ✅ `config.yaml` |
| Borrar sesiones viejas | ❌ | ✅ `hermes sessions delete <id>` |
| Modelo por conversación | ⚠️ chip del composer | — |
| Modelo del perfil `default` | ❓ (modo edición de perfil no ubicado aún) | — |
| Reasoning effort | ⚠️ chip del composer | — |

## SOUL.md (reemplazo completo)

Aplicar en: **WebUI → Memory → Agent Soul → botón lápiz → pegar → guardar**

```markdown
# Rol
Sos el Agente Técnico de soporte. Auditás los flujos de n8n del "Data Agent" de
Spectrum y devolvés un diagnóstico. No hacés nada más.

# Alcance — solo estos 4 workflows (proyecto Spectrum / Data Agent)
- RNLfUdDZRbnVURUJ — DataAgent - Core
- AHfgaFMikEoLK7Va — DataAgent - Mongo Query Tool
- yTskjLij1y2QbFdK — DataAgent - Slack Trigger
- t9fDyF1aVCyCYkEk — DataAgent - Weekly Summary

No audites ni describas ningún otro workflow, ni de otros proyectos o clientes.

# Reglas
1. SOLO LECTURA. Nunca uses tools que creen, modifiquen, publiquen, activen o
   re-disparen workflows, ni tools de data_table.
2. No inventes. Si no hay evidencia concreta en las tools, decí "no pude confirmar
   la causa" y listá lo que sí verificaste.
3. No ofrezcas arreglar ni tocar nada: tu trabajo termina en el diagnóstico.

# Cómo responder
- Narrá tu proceso en el hilo de Slack donde te mencionaron.
- En tu ÚNICO mensaje final mencioná a <@U0BLB3VA5QD> y separá dos partes:
  - Evidencia técnica (qué viste en ejecuciones/nodos, para el equipo interno).
  - Resumen para el cliente (sin jerga de n8n, sin IDs de nodos ni JSON).
- Mencioná a <@U0BLB3VA5QD> SOLO en el último mensaje, nunca antes.
```

## config.yaml — `mcp_servers.n8n-spectrum`

Editar por **CLI/SSH** en el contenedor `hermes-agent`. Esta sección reemplaza cualquier
`tools.include` existente (o se agrega si no existe) bajo `mcp_servers.n8n-spectrum`:

```yaml
mcp_servers:
  n8n-spectrum:
    tools:
      include:
        - search_workflows
        - get_workflow_details
        - get_workflow_history
        - get_workflow_version
        - search_executions
        - get_execution
        - search_nodes
        - get_node_types
        - list_tags
```

Esto reduce los schemas de tools de 33 a 9 por mensaje — el mayor impacto en tokens y en
eliminar la posibilidad de que el Técnico use tools de escritura (aunque `SOUL.md` ya lo
prohíbe, esto es control real de acceso, no solo prompt).

## Modelo y reasoning effort (decisión pendiente)

- **Recomendación**: mantener `deepseek-v4-flash` + `reasoning Low` por ahora.
  - Los 4 workflows del Data Agent son simples y no están en producción.
  - Flash es más barato, Low reasoning consume menos tokens.
  - Si se ve imprecisión en las respuestas, subir a `pro`.
- **Dónde cambiar**: el chip de modelo del composer es por-conversación. Para cambiar el
  perfil `default` (que aplique siempre), falta ubicar el modo de edición del perfil en la
  WebUI — la card de "Agent profiles" es de solo lectura en la vista actual.

## Orden de aplicación

1. **Editar `SOUL.md`** vía WebUI (Memory → Agent Soul → lápiz → pegar → guardar).
2. **Borrar sesiones viejas** para que el nuevo `SOUL.md` aplique (el system prompt se cachea
   al inicio de cada sesión — las conversaciones ya abiertas no lo toman):
   ```bash
   hermes sessions list
   hermes sessions delete <id>   # una por cada sesión activa
   ```
3. **Editar `config.yaml`** por SSH en el contenedor `hermes-agent`, agregar/editar la sección
   `mcp_servers.n8n-spectrum.tools.include` con la lista de 9 tools de arriba, y reiniciar
   Hermes (o redeployar desde Coolify).
4. **Probar en vivo**: mandar una pregunta sobre el Data Agent por Slack a Daniel, confirmar
   que crea el ticket en Monday, que aparece el aviso al Técnico en `tecnico-spectrum`, que
   el Técnico responde con precisión (solo los 4 workflows, sin tools de escritura), y que
   el cliente recibe el diagnóstico sin jerga de n8n.