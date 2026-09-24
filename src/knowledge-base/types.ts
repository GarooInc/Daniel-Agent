// visibilidad (ver kb/politica-acceso-y-visibilidad.md): 'interno' es diagnóstico técnico que
// nunca debe llegar a un canal de cliente (filtrado en searchFaqsBySimilarity). 'publico'/
// 'cliente' no se distinguen todavía en runtime — ninguna FAQ de esos dos tipos es específica de
// un cliente puntual, es solo una distinción documental por ahora.
export type Faq = {
  id: string;
  producto: string;
  categoria: string;
  pregunta: string;
  respuesta: string;
  tags: string[];
  visibilidad: "publico" | "cliente" | "interno";
};

export type Customer = {
  id: string;
  nombre: string;
  email: string;
  empresa: string;
  producto: string;
  plan: string;
  estadoCuenta: string;
  fechaAlta: string;
  canalPreferido: string;
  notas: string;
};
