/**
 * Popula o banco com dados de demonstração.
 *
 *   pnpm --filter @rating-pro/api seed:demo
 *
 * Idempotente: usa e-mails e documentos fixos, então rodar de novo reaproveita
 * o que já existe em vez de duplicar. Rode `seed:masters` antes — o rating
 * precisa de um master para constar como emissor.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_FACTORS, scoreFromFactors } from '@rating-pro/shared';
import { loadEnvFiles } from '../config/env-files';

loadEnvFiles();

const RESELLERS = [
  { email: 'demo.correspondente@ratingpro.test', name: 'Ana Correspondente', rate: 0.35 },
  { email: 'demo.assessor@ratingpro.test', name: 'Bruno Assessor', rate: 0.3 },
];

const CLIENTS = [
  { personType: 'pj' as const, document: '11222333000181', name: 'Metalúrgica Aurora LTDA', city: 'Joinville', state: 'SC' },
  { personType: 'pj' as const, document: '19131243000197', name: 'Transportes Vega ME', city: 'Campinas', state: 'SP' },
  { personType: 'pf' as const, document: '52998224725', name: 'Carla Mendes', city: 'Belo Horizonte', state: 'MG' },
  { personType: 'pf' as const, document: '11144477735', name: 'Diego Ramos', city: 'Curitiba', state: 'PR' },
];

const DEMO_PASSWORD = 'DemoRatingPro!2026';

const DEMO_ADDRESS = {
  zip: '89201000',
  street: 'Rua das Palmeiras',
  number: '120',
  complement: '',
  district: 'Centro',
  city: 'Joinville',
  state: 'SC',
};

const DEMO_CREDIT = {
  hasRestriction: false,
  restrictionDetails: '',
  openDebtAmount: 4200,
  bankRelationships: 3,
};

/** Formulários de coleta de demonstração, um por tipo de pessoa. */
const DEMO_INTAKE = {
  pf: {
    personType: 'pf',
    birthDate: '1985-09-20',
    motherName: 'Helena Mendes',
    maritalStatus: 'casado',
    dependents: 1,
    occupation: 'Representante comercial',
    employmentType: 'autonomo',
    employmentMonths: 72,
    monthlyIncome: 11500,
    otherIncome: 1200,
    address: DEMO_ADDRESS,
    assets: { realEstate: 450000, vehicles: 85000, investments: 60000 },
    credit: DEMO_CREDIT,
    purpose: 'Análise de perfil para pleito de crédito bancário.',
  },
  pj: {
    personType: 'pj',
    legalName: 'Metalúrgica Aurora LTDA',
    tradeName: 'Aurora Metais',
    foundedAt: '2012-03-15',
    taxRegime: 'presumido',
    companySize: 'media',
    sector: 'Metalurgia e usinagem',
    employees: 68,
    address: DEMO_ADDRESS,
    representative: { name: 'Roberto Aurora', document: '52998224725', sharePercent: 60 },
    financials: {
      monthlyRevenue: 720000,
      annualRevenue: 8600000,
      netProfit: 940000,
      shareCapital: 500000,
      currentDebt: 1250000,
      totalAssets: 5400000,
    },
    hasAuditedStatements: true,
    credit: DEMO_CREDIT,
    purpose: 'Habilitação em processo licitatório e negociação com fornecedores.',
  },
} as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const master = await prisma.profile.findFirst({
      where: { role: 'master' },
      select: { id: true, email: true },
    });

    if (!master) {
      throw new Error('Nenhum master encontrado. Rode primeiro: pnpm --filter @rating-pro/api seed:masters');
    }

    console.log(`Emissor dos ratings: ${master.email}`);

    // --- revendedores ------------------------------------------------------
    const resellerIds: string[] = [];

    for (const spec of RESELLERS) {
      let profile = await prisma.profile.findUnique({
        where: { email: spec.email },
        select: { id: true },
      });

      if (!profile) {
        const rows = await prisma.$queryRaw<Array<{ id: string }>>`
          select private.create_local_user(
            ${spec.email},
            ${DEMO_PASSWORD},
            jsonb_build_object('full_name', ${spec.name}, 'phone', '11988887777')
          ) as id
        `;

        const id = rows[0]?.id;
        if (!id) throw new Error(`Falha ao criar ${spec.email}`);

        // O trigger on_auth_user_created roda na mesma transação do insert.
        profile = await prisma.profile.findUniqueOrThrow({
          where: { id },
          select: { id: true },
        });
        console.log(`  + revendedor ${spec.email}`);
      } else {
        console.log(`  = revendedor ${spec.email} já existia`);
      }

      await prisma.profile.update({
        where: { id: profile.id },
        data: { status: 'active', commissionRate: spec.rate, fullName: spec.name },
      });

      resellerIds.push(profile.id);
    }

    // --- clientes ----------------------------------------------------------
    const clientIds: string[] = [];

    for (const [index, spec] of CLIENTS.entries()) {
      const resellerId = resellerIds[index % resellerIds.length]!;

      const client = await prisma.client.upsert({
        where: { resellerId_document: { resellerId, document: spec.document } },
        update: { name: spec.name, city: spec.city, state: spec.state },
        create: { ...spec, resellerId },
        select: { id: true },
      });

      clientIds.push(client.id);
    }
    console.log(`  = ${clientIds.length} clientes prontos`);

    // --- pedidos em estágios variados --------------------------------------
    const existingOrders = await prisma.ratingOrder.count();

    if (existingOrders > 0) {
      console.log(`  = ${existingOrders} pedidos já existem; nada de novo foi criado`);
    } else {
      const plan: Array<{ clientIndex: number; sale: number; target: 'draft' | 'submitted' | 'in_analysis' | 'delivered' | 'rejected' }> = [
        { clientIndex: 0, sale: 1800, target: 'delivered' },
        { clientIndex: 1, sale: 1200, target: 'delivered' },
        { clientIndex: 2, sale: 900, target: 'in_analysis' },
        { clientIndex: 3, sale: 1500, target: 'submitted' },
        { clientIndex: 0, sale: 700, target: 'draft' },
        { clientIndex: 1, sale: 1000, target: 'rejected' },
      ];

      const scores = [912, 786, 0, 0, 0, 0];

      for (const [index, item] of plan.entries()) {
        const clientId = clientIds[item.clientIndex]!;
        const client = await prisma.client.findUniqueOrThrow({
          where: { id: clientId },
          select: { resellerId: true, personType: true },
        });

        const order = await prisma.ratingOrder.create({
          data: {
            resellerId: client.resellerId,
            clientId,
            saleAmount: new Prisma.Decimal(item.sale),
            resellerNotes: 'Pedido de demonstração.',
            // O trigger exige o formulário para sair de rascunho, e o tipo tem
            // de casar com o do cliente.
            intake: DEMO_INTAKE[client.personType],
          },
          select: { id: true, code: true },
        });

        if (item.target === 'draft') {
          console.log(`  + ${order.code} (rascunho)`);
          continue;
        }

        await prisma.ratingOrder.update({ where: { id: order.id }, data: { status: 'submitted' } });

        if (item.target === 'submitted') {
          console.log(`  + ${order.code} (enviado)`);
          continue;
        }

        await prisma.ratingOrder.update({
          where: { id: order.id },
          data: { status: 'in_analysis', assignedTo: master.id },
        });

        if (item.target === 'in_analysis') {
          console.log(`  + ${order.code} (em análise)`);
          continue;
        }

        if (item.target === 'rejected') {
          await prisma.ratingOrder.update({
            where: { id: order.id },
            data: { status: 'rejected', rejectionReason: 'Documentação insuficiente para análise.' },
          });
          console.log(`  + ${order.code} (recusado)`);
          continue;
        }

        const factors = DEFAULT_FACTORS.map((factor, position) => ({
          ...factor,
          score: Math.max(300, (scores[index] ?? 800) - position * 18),
        }));

        await prisma.rating.create({
          data: {
            orderId: order.id,
            score: scoreFromFactors(factors) ?? scores[index] ?? 800,
            summary:
              'Avaliação de demonstração. Histórico de pagamentos regular e capacidade de endividamento compatível com o porte.',
            factors,
            validUntil: new Date(Date.UTC(2027, 6, 29)),
            issuedBy: master.id,
          },
        });

        await prisma.ratingOrder.update({ where: { id: order.id }, data: { status: 'approved' } });
        await prisma.ratingOrder.update({ where: { id: order.id }, data: { status: 'delivered' } });
        console.log(`  + ${order.code} (entregue com rating)`);
      }
    }

    // --- leads da landing --------------------------------------------------
    const leadCount = await prisma.lead.count();

    if (leadCount === 0) {
      await prisma.lead.createMany({
        data: [
          { name: 'Eduardo Lima', email: 'eduardo.demo@ratingpro.test', phone: '11987654321', company: 'Lima Crédito', source: 'landing-hero', message: 'Quero entender as comissões.' },
          { name: 'Fernanda Souza', email: 'fernanda.demo@ratingpro.test', phone: '21912345678', source: 'calculadora', status: 'contacted' },
          { name: 'Gustavo Reis', email: 'gustavo.demo@ratingpro.test', phone: '31955554444', company: 'GR Assessoria', source: 'landing-cta-final', status: 'qualified' },
        ],
      });
      console.log('  + 3 leads de demonstração');
    } else {
      console.log(`  = ${leadCount} leads já existem`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\nSeed de demonstração concluído.');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(`\nFalhou: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
