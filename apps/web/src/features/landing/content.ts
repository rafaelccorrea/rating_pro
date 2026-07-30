/**
 * Conteúdo textual da landing, fora dos módulos de componente. Misturar dados
 * exportados com componentes num mesmo arquivo derruba o Fast Refresh do Vite,
 * forçando reload inteiro a cada edição.
 */

export interface ComparisonRow {
  feature: string;
  ours: boolean | string;
  theirs: boolean | string;
}

/**
 * Comparativo com o modelo tradicional. Descreve o processo manual que o
 * revendedor faz hoje — não é comparação com um concorrente nomeado.
 */
export const COMPARISON: ReadonlyArray<ComparisonRow> = [
  { feature: 'Painel para acompanhar cada pedido em tempo real', ours: true, theirs: false },
  { feature: 'Laudo em PDF gerado automaticamente', ours: true, theirs: false },
  { feature: 'Fatores da nota abertos, com peso e pontuação', ours: true, theirs: false },
  { feature: 'Trilha de auditoria de cada mudança de status', ours: true, theirs: false },
  { feature: 'Comissão conhecida antes de vender', ours: true, theirs: false },
  { feature: 'Prazo de entrega', ours: 'Até 30 dias', theirs: 'Sem prazo definido' },
  { feature: 'Investimento inicial', ours: 'Nenhum', theirs: 'Varia' },
  { feature: 'Mensalidade', ours: 'Nenhuma', theirs: 'Comum' },
];

export const FAQ_ITEMS: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: 'O que é um rating de crédito e para que ele serve?',
    answer:
      'É uma classificação que resume, numa escala de 0 a 1000 pontos e numa nota de AAA a D, o perfil de risco de uma empresa ou pessoa. Serve como documento de apoio em negociações de crédito, contratos e relações comerciais, mostrando de forma organizada os fatores que compõem aquele risco.',
  },
  {
    question: 'Como funciona a revenda?',
    answer:
      'Você cria sua conta, cadastra o cliente final e abre o pedido no painel. Nossa equipe de análise avalia, define o score e emite o laudo em PDF. Você acompanha cada etapa pelo painel, entrega o laudo ao cliente e fica com sua comissão sobre o valor que cobrou.',
  },
  {
    question: 'Quanto eu ganho por venda?',
    answer:
      'A comissão padrão de entrada é de 30% sobre o valor que você cobra do cliente, e pode ser ajustada conforme o volume da sua carteira. Como você define o preço final, sua margem por laudo depende diretamente do quanto você cobra — use a calculadora acima para simular.',
  },
  {
    question: 'Preciso investir algo para começar?',
    answer:
      'Não há taxa de adesão nem mensalidade. Você abre pedidos conforme fecha vendas, e a comissão é apurada sobre os laudos efetivamente entregues.',
  },
  {
    question: 'Qual o prazo de entrega do laudo?',
    answer:
      'O prazo de referência é de até 30 dias a partir do envio do pedido com a documentação completa. Pedidos com pendência de documento ficam marcados como pendência no painel até que você complete as informações.',
  },
  {
    question: 'O rating garante aprovação de crédito?',
    answer:
      'Não. O laudo é um documento informativo que organiza e classifica o perfil de risco com base nos dados disponíveis na data da emissão. A decisão de conceder crédito é sempre da instituição analisadora, que aplica seus próprios critérios.',
  },
  {
    question: 'Como ficam os dados do meu cliente?',
    answer:
      'Os dados são usados exclusivamente para produzir a análise contratada. Cada revendedor acessa apenas a própria carteira — o isolamento é aplicado no banco de dados, não só na interface. Anexos e laudos ficam em armazenamento privado, acessível por link temporário.',
  },
  {
    question: 'Posso cancelar um pedido?',
    answer:
      'Sim, enquanto ele ainda não entrou em análise. Depois que a equipe assume o pedido, ele segue o fluxo até a emissão ou a recusa justificada, e todo o histórico fica registrado na trilha de auditoria.',
  },
];
