import { getPool } from "./client.js";
import { logger } from "../../config/logger.js";
import type { JevEvaluationResult } from "../jev/client.js";
import type { TicketDraftFields } from "./ticket-draft.js";

export interface JevBenchmarkLogEntry {
  id?: number;
  slackUserId?: string;
  canalOrigen?: string;
  mensajeCliente: string;
  llmLatenciaMs: number;
  llmCostoUsd: number;
  llmProducto?: string;
  llmUrgencia?: string;
  llmTipoSolicitud?: string;
  jev: JevEvaluationResult;
}

export async function saveJevBenchmarkLog(entry: JevBenchmarkLogEntry): Promise<void> {
  try {
    const pool = await getPool();

    const speedup =
      entry.jev.latenciaMs > 0 ? Number((entry.llmLatenciaMs / entry.jev.latenciaMs).toFixed(2)) : 1.0;

    const coincidenciaProducto = entry.llmProducto
      ? entry.llmProducto.toLowerCase() === entry.jev.producto.toLowerCase()
      : null;

    const coincidenciaTipo = entry.llmTipoSolicitud
      ? entry.llmTipoSolicitud.toLowerCase() === entry.jev.tipoSolicitud.toLowerCase()
      : null;

    await pool.query(
      `INSERT INTO jev_benchmark_logs (
        slack_user_id,
        canal_origen,
        mensaje_cliente,
        llm_latencia_ms,
        llm_costo_usd,
        llm_producto,
        llm_urgencia,
        llm_tipo_solicitud,
        jev_latencia_ms,
        jev_costo_usd,
        jev_producto,
        jev_urgencia_score,
        jev_urgencia_label,
        jev_tipo_solicitud,
        jev_requiere_tecnico_prob,
        jev_intencion,
        jev_confidence,
        speedup_ratio,
        coincidencia_producto,
        coincidencia_tipo,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now()
      )`,
      [
        entry.slackUserId || null,
        entry.canalOrigen || "slack",
        entry.mensajeCliente,
        entry.llmLatenciaMs,
        entry.llmCostoUsd,
        entry.llmProducto || null,
        entry.llmUrgencia || null,
        entry.llmTipoSolicitud || null,
        entry.jev.latenciaMs,
        entry.jev.costoUsd,
        entry.jev.producto,
        entry.jev.urgenciaScore,
        entry.jev.urgenciaLabel,
        entry.jev.tipoSolicitud,
        entry.jev.requiereTecnicoProb,
        entry.jev.intencion,
        entry.jev.confidence,
        speedup,
        coincidenciaProducto,
        coincidenciaTipo,
      ]
    );
  } catch (error) {
    logger.warn({ err: error }, "No se pudo guardar el log de benchmark de Jev (no-bloqueante)");
  }
}
