// El LLM escribe Markdown estándar (GitHub-flavored) por su cuenta — negrita con "**texto**",
// links con "[texto](url)" — pero Slack usa su propio formato "mrkdwn", que no es lo mismo:
// negrita es "*texto*" (un asterisco), y los links son "<url|texto>". Sin esta conversión,
// Slack no reconoce "**texto**" como negrita y lo muestra literal con los asteriscos de más
// (bug real encontrado en vivo, 2026-08-05). Se corrige acá, en un solo lugar, en vez de
// depender de que el prompt logre que el modelo escriba mrkdwn nativo de forma confiable.
export function toSlackMrkdwn(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, "<$2|$1>");
}
