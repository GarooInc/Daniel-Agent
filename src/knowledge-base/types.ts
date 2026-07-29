export type Faq = {
  id: string;
  producto: string;
  categoria: string;
  pregunta: string;
  respuesta: string;
  tags: string[];
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
