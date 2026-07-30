/**
 * Testes de integração da API contra o banco real.
 *
 *   pnpm --filter @rating-pro/api test:e2e
 *
 * Sem nenhum stub: a aplicação sobe inteira, os usuários são criados de
 * verdade, o token vem de um `POST /api/auth/login` real e o laudo em PDF é
 * gerado pelo pdfkit. Isso exercita guard, roles, pipes, services, Prisma e
 * todos os triggers do Postgres num único caminho.
 *
 * Os dados de teste usam e-mails @e2e.test e são removidos no final.
 */

// Precisa vir antes de qualquer import do app: o ConfigModule valida no load.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'segredo-de-teste-com-mais-de-32-caracteres-aqui';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { SerializeInterceptor } from '../src/common/serialize.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'senhaDeTeste123';

const ADDRESS = {
  zip: '89201-000',
  street: 'Rua das Palmeiras',
  number: '120',
  complement: '',
  district: 'Centro',
  city: 'Joinville',
  state: 'SC',
} as const;

const CREDIT_OK = {
  hasRestriction: false,
  restrictionDetails: '',
  openDebtAmount: 1500,
  bankRelationships: 2,
} as const;

/** Formulário de coleta de pessoa física, válido. */
const PF_INTAKE = {
  personType: 'pf',
  birthDate: '1988-04-12',
  motherName: 'Maria Souza',
  maritalStatus: 'casado',
  dependents: 2,
  occupation: 'Analista de sistemas',
  employmentType: 'clt',
  employmentMonths: 48,
  monthlyIncome: 9500,
  otherIncome: 800,
  address: ADDRESS,
  assets: { realEstate: 320000, vehicles: 60000, investments: 25000 },
  credit: CREDIT_OK,
  purpose: 'Pleito de crédito para capital de giro pessoal.',
} as const;

/** Formulário de coleta de pessoa jurídica, válido. */
const PJ_INTAKE = {
  personType: 'pj',
  legalName: 'Metalúrgica Teste LTDA',
  tradeName: 'Metal Teste',
  foundedAt: '2015-06-01',
  taxRegime: 'simples',
  companySize: 'pequena',
  sector: 'Metalurgia',
  employees: 24,
  address: ADDRESS,
  representative: { name: 'Carlos Souza', document: '529.982.247-25', sharePercent: 70 },
  financials: {
    monthlyRevenue: 180000,
    annualRevenue: 2100000,
    netProfit: 240000,
    shareCapital: 100000,
    currentDebt: 350000,
    totalAssets: 1200000,
  },
  hasAuditedStatements: false,
  credit: CREDIT_OK,
  purpose: 'Participação em licitação pública municipal.',
} as const;

const USERS = [
  { key: 'master', email: 'master@e2e.test', name: 'Master E2E' },
  { key: 'revA', email: 'rev-a@e2e.test', name: 'Revendedor A' },
  { key: 'revB', email: 'rev-b@e2e.test', name: 'Revendedor B' },
] as const;

describe('API (e2e, banco real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => request.Agent;

  /** Preenchidos no beforeAll: id e token de sessão de cada usuário. */
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  let MASTER = '';
  let REV_A = '';
  let REV_B = '';

  /**
   * O limite de 2 masters é uma regra real do banco, e a suíte precisa controlar
   * a contagem por completo: 1 master de teste, promover A (2), tentar B (deve
   * falhar). Num banco que já tem masters, não sobra espaço para essa manobra.
   *
   * Então a suíte empresta TODAS as vagas: rebaixa os masters existentes no
   * início e os repromove no afterAll.
   *
   * Se o processo morrer no meio, `pnpm --filter @rating-pro/api seed:masters`
   * repromove os masters configurados no .env.
   *
   * O certo, num setup maduro, é apontar DATABASE_URL para um banco de teste
   * dedicado — aí nada disso é necessário.
   */
  let borrowedMasterIds: string[] = [];

  const as = (userKey: string) => ({ Authorization: `Bearer ${tokens[userKey]}` });

  async function cleanup(): Promise<void> {
    const emails = USERS.map((user) => user.email);

    const profiles = await prisma.profile.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const profileIds = profiles.map((profile) => profile.id);

    // Ordem importa: rating_orders referencia profiles com ON DELETE RESTRICT,
    // então os pedidos saem antes dos usuários. Apagar o pedido cascateia
    // rating, eventos e documentos.
    await prisma.ratingOrder.deleteMany({ where: { resellerId: { in: profileIds } } });
    await prisma.client.deleteMany({ where: { resellerId: { in: profileIds } } });
    await prisma.lead.deleteMany({ where: { email: { endsWith: '@e2e.test' } } });
    await prisma.$executeRawUnsafe(`delete from auth.users where email like '%@e2e.test'`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new SerializeInterceptor());
    await app.init();

    prisma = app.get(PrismaService);
    http = () => request(app.getHttpServer());

    await cleanup();

    // Usuários criados pela mesma função que a API usa; o trigger
    // on_auth_user_created cria o profile como reseller/active.
    for (const user of USERS) {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        select private.create_local_user(
          ${user.email},
          ${PASSWORD},
          jsonb_build_object('full_name', ${user.name})
        ) as id
      `;
      ids[user.key] = rows[0]!.id;
    }

    MASTER = ids['master']!;
    REV_A = ids['revA']!;
    REV_B = ids['revB']!;

    // Libera todas as vagas de master (ver comentário em `borrowedMasterIds`).
    const currentMasters = await prisma.profile.findMany({
      where: { role: 'master' },
      select: { id: true },
    });

    borrowedMasterIds = currentMasters.map((master) => master.id);

    if (borrowedMasterIds.length > 0) {
      await prisma.profile.updateMany({
        where: { id: { in: borrowedMasterIds } },
        data: { role: 'reseller' },
      });
    }

    await prisma.profile.update({ where: { id: MASTER }, data: { role: 'master' } });
    // Comissão fixa para o cálculo do trigger ser previsível no teste.
    await prisma.profile.updateMany({
      where: { id: { in: [REV_A, REV_B] } },
      data: { commissionRate: 0.3 },
    });

    // Token de sessão via login real.
    for (const user of USERS) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);

      tokens[user.key] = res.body.token;
    }
  });

  afterAll(async () => {
    // cleanup() remove os usuários de teste, liberando as vagas de master.
    await cleanup();

    // Restaura um a um: `updateMany` não dispara o trigger por linha da mesma
    // forma, e um erro em um master não deve impedir a volta dos outros.
    for (const id of borrowedMasterIds) {
      try {
        await prisma.profile.update({ where: { id }, data: { role: 'master' } });
      } catch (error) {
        console.error(
          `Falha ao repromover o master ${id}. Rode: pnpm --filter @rating-pro/api seed:masters`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    await app.close();
  });

  // ------------------------------------------------------------------ público

  describe('rotas públicas', () => {
    it('GET /api/health responde com o banco up', async () => {
      const res = await http().get('/api/health').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('up');
    });

    it('POST /api/leads aceita lead válido e normaliza o telefone', async () => {
      const res = await http()
        .post('/api/leads')
        .send({
          name: 'Lead E2E',
          email: 'lead@e2e.test',
          phone: '(11) 98765-4321',
          source: 'calculadora',
        })
        .expect(201);

      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);

      const lead = await prisma.lead.findFirstOrThrow({ where: { email: 'lead@e2e.test' } });
      expect(lead.phone).toBe('11987654321');
      expect(lead.status).toBe('new');
      expect(lead.source).toBe('calculadora');
    });

    it('POST /api/leads devolve 400 com erros por campo', async () => {
      const res = await http()
        .post('/api/leads')
        .send({ name: 'Jo', email: 'nao-e-email', phone: '1' })
        .expect(400);

      expect(res.body.message).toBe('Dados inválidos');
      expect(Object.keys(res.body.errors).sort()).toEqual(['email', 'name', 'phone']);
    });

    it('POST /api/auth/signup cria a conta e já devolve sessão utilizável', async () => {
      const res = await http()
        .post('/api/auth/signup')
        .send({
          fullName: 'Novo Revendedor',
          email: 'signup@e2e.test',
          password: 'senhaDoNovo123',
          phone: '(11) 98888-7777',
          document: '529.982.247-25',
        })
        .expect(201);

      expect(res.body.token.split('.')).toHaveLength(3);
      expect(res.body.profile.role).toBe('reseller');
      expect(res.body.profile.status).toBe('active');
      // O trigger normaliza os metadados: telefone e documento sem máscara.
      expect(res.body.profile.phone).toBe('11988887777');
      expect(res.body.profile.document).toBe('52998224725');

      // A sessão recém-criada funciona de imediato.
      const me = await http()
        .get('/api/me')
        .set({ Authorization: `Bearer ${res.body.token}` })
        .expect(200);

      expect(me.body.email).toBe('signup@e2e.test');
    });

    it('signup recusa e-mail já cadastrado com 409', async () => {
      const res = await http()
        .post('/api/auth/signup')
        .send({
          fullName: 'Duplicado',
          email: 'signup@e2e.test',
          password: 'outraSenha123',
          phone: '11988887777',
        })
        .expect(409);

      expect(res.body.message).toContain('Já existe uma conta');
    });

    it('signup recusa senha com menos de 8 caracteres', async () => {
      const res = await http()
        .post('/api/auth/signup')
        .send({
          fullName: 'Senha Curta',
          email: 'curta@e2e.test',
          password: 'abc123',
          phone: '11988887777',
        })
        .expect(400);

      expect(res.body.errors.password?.[0]).toContain('8 caracteres');
    });
  });

  // -------------------------------------------------------------- autenticação

  describe('autenticação e papéis', () => {
    it('login com senha correta devolve token, validade e perfil', async () => {
      const res = await http()
        .post('/api/auth/login')
        .send({ email: 'rev-a@e2e.test', password: PASSWORD })
        .expect(200);

      // JWT tem três segmentos separados por ponto.
      expect(res.body.token.split('.')).toHaveLength(3);
      expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(res.body.profile.email).toBe('rev-a@e2e.test');
      expect(res.body.profile.role).toBe('reseller');
    });

    it('login com senha errada devolve 401 sem revelar se o e-mail existe', async () => {
      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ email: 'rev-a@e2e.test', password: 'errada123' })
        .expect(401);

      const unknownEmail = await http()
        .post('/api/auth/login')
        .send({ email: 'nao-existe@e2e.test', password: 'errada123' })
        .expect(401);

      // Mensagem idêntica nos dois casos: sem enumeração de usuários.
      expect(wrongPassword.body.message).toBe('E-mail ou senha incorretos');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('rota protegida sem token devolve 401', async () => {
      const res = await http().get('/api/orders').expect(401);
      expect(res.body.message).toBe('Token de acesso ausente');
    });

    it('token inválido devolve 401', async () => {
      const res = await http()
        .get('/api/orders')
        .set({ Authorization: 'Bearer nao.e.um.jwt' })
        .expect(401);

      expect(res.body.message).toBe('Sessão inválida ou expirada');
    });

    it('token assinado com outro segredo é rejeitado', async () => {
      // Assinado com HS256 e segredo diferente; estrutura válida, assinatura não.
      const forged =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
        '.eyJzdWIiOiJmYWtlIiwiZW1haWwiOiJ4QHgiLCJpc3MiOiJyYXRpbmctcHJvIn0' +
        '.assinatura-invalida';

      await http().get('/api/orders').set({ Authorization: `Bearer ${forged}` }).expect(401);
    });

    it('troca de senha exige a senha atual correta', async () => {
      await http()
        .patch('/api/auth/password')
        .set(as('revB'))
        .send({ currentPassword: 'errada123', newPassword: 'novaSenha456' })
        .expect(401);
    });

    it('troca de senha funciona e a antiga deixa de valer', async () => {
      const nova = 'senhaNovaDoB789';

      await http()
        .patch('/api/auth/password')
        .set(as('revB'))
        .send({ currentPassword: PASSWORD, newPassword: nova })
        .expect(200);

      await http()
        .post('/api/auth/login')
        .send({ email: 'rev-b@e2e.test', password: PASSWORD })
        .expect(401);

      const res = await http()
        .post('/api/auth/login')
        .send({ email: 'rev-b@e2e.test', password: nova })
        .expect(200);

      // O token antigo continua válido até expirar; renova para os testes seguintes.
      tokens['revB'] = res.body.token;
    });

    it('master redefine a senha de um revendedor', async () => {
      await http()
        .patch(`/api/profiles/${REV_B}/password`)
        .set(as('master'))
        .send({ password: PASSWORD })
        .expect(200);

      const res = await http()
        .post('/api/auth/login')
        .send({ email: 'rev-b@e2e.test', password: PASSWORD })
        .expect(200);

      tokens['revB'] = res.body.token;
    });

    it('revendedor não redefine senha de outro', async () => {
      await http()
        .patch(`/api/profiles/${REV_A}/password`)
        .set(as('revB'))
        .send({ password: 'tentativa123' })
        .expect(403);
    });

    it('GET /api/me devolve o perfil do portador do token', async () => {
      const res = await http().get('/api/me').set(as('revA')).expect(200);

      expect(res.body.email).toBe('rev-a@e2e.test');
      expect(res.body.role).toBe('reseller');
      // O interceptor converte Decimal do Prisma para number.
      expect(res.body.commissionRate).toBe(0.3);
    });

    it('rota de master recusa revendedor com 403', async () => {
      await http().get('/api/leads').set(as('revA')).expect(403);
    });

    it('rota de master aceita master', async () => {
      const res = await http().get('/api/leads').set(as('master')).expect(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('revendedor não altera o próprio papel via PATCH /api/me', async () => {
      await http().patch('/api/me').set(as('revA')).send({ role: 'master' }).expect(200);

      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: REV_A } });
      expect(profile.role).toBe('reseller');
    });
  });

  // ------------------------------------------------------------------ clientes

  describe('clientes e isolamento entre revendedores', () => {
    let clientA = '';

    it('revendedor cadastra cliente PJ', async () => {
      const res = await http()
        .post('/api/clients')
        .set(as('revA'))
        .send({
          personType: 'pj',
          document: '11.222.333/0001-81',
          name: 'Cliente do A LTDA',
          city: 'Joinville',
          state: 'SC',
        })
        .expect(201);

      clientA = res.body.id;
      // A máscara é removida pelo schema zod compartilhado.
      expect(res.body.document).toBe('11222333000181');
    });

    it('recusa CPF inválido com 400', async () => {
      const res = await http()
        .post('/api/clients')
        .set(as('revA'))
        .send({ personType: 'pf', document: '11111111111', name: 'Fulano' })
        .expect(400);

      expect(res.body.errors.document?.[0]).toBe('CPF ou CNPJ inválido');
    });

    it('recusa CNPJ em pessoa física com 400', async () => {
      await http()
        .post('/api/clients')
        .set(as('revA'))
        .send({ personType: 'pf', document: '11.222.333/0001-81', name: 'Fulano' })
        .expect(400);
    });

    it('master não cadastra cliente', async () => {
      const res = await http()
        .post('/api/clients')
        .set(as('master'))
        // Payload precisa ser válido, senão o 400 do zod mascara o 403 do papel.
        .send({ personType: 'pf', document: '529.982.247-25', name: 'Cliente do Master' })
        .expect(403);

      expect(res.body.message).toContain('Master não cadastra clientes');
    });

    it('revendedor B não vê o cliente do A na listagem', async () => {
      const res = await http().get('/api/clients').set(as('revB')).expect(200);
      expect(res.body.items.map((item: { id: string }) => item.id)).not.toContain(clientA);
    });

    it('revendedor B recebe 403 ao abrir o cliente do A pelo id', async () => {
      await http().get(`/api/clients/${clientA}`).set(as('revB')).expect(403);
    });

    it('master vê o cliente de qualquer revendedor', async () => {
      const res = await http().get(`/api/clients/${clientA}`).set(as('master')).expect(200);
      expect(res.body.id).toBe(clientA);
    });
  });

  // -------------------------------------------------------------------- pedidos

  describe('ciclo de vida do pedido', () => {
    let clientId = '';
    let orderId = '';
    let orderCode = '';

    beforeAll(async () => {
      const client = await prisma.client.create({
        data: {
          resellerId: REV_A,
          personType: 'pf',
          document: '52998224725',
          name: 'Carla E2E',
          city: 'Belo Horizonte',
          state: 'MG',
        },
      });
      clientId = client.id;
    });

    it('cria pedido como rascunho, com código e comissão derivados no banco', async () => {
      const res = await http()
        .post('/api/orders')
        .set(as('revA'))
        .send({ clientId, saleAmount: 1000, submit: false, intake: PF_INTAKE })
        .expect(201);

      orderId = res.body.id;
      orderCode = res.body.code;

      expect(orderCode).toMatch(/^RP-\d{4}-\d{6}$/);
      expect(res.body.status).toBe('draft');
      // Trigger: 1000 * 0.3
      expect(res.body.commissionAmount).toBe(300);
      // internalNotes nunca vai para o revendedor.
      expect(res.body).not.toHaveProperty('internalNotes');
    });

    it('recusa pedido com cliente de outro revendedor', async () => {
      await http()
        .post('/api/orders')
        .set(as('revB'))
        .send({ clientId, saleAmount: 500 })
        .expect(403);
    });

    it('recusa envio para análise sem o formulário de coleta', async () => {
      const res = await http()
        .post('/api/orders')
        .set(as('revA'))
        .send({ clientId, saleAmount: 500, submit: true })
        .expect(400);

      expect(res.body.errors.intake?.[0]).toContain('formulário');
    });

    it('recusa formulário de PJ em cliente pessoa física', async () => {
      const res = await http()
        .post('/api/orders')
        .set(as('revA'))
        .send({ clientId, saleAmount: 500, submit: true, intake: PJ_INTAKE })
        .expect(400);

      expect(res.body.message).toContain('pessoa física');
    });

    it('recusa formulário de PF com restrição declarada sem detalhe', async () => {
      const res = await http()
        .post('/api/orders')
        .set(as('revA'))
        .send({
          clientId,
          saleAmount: 500,
          submit: true,
          intake: {
            ...PF_INTAKE,
            credit: { ...CREDIT_OK, hasRestriction: true, restrictionDetails: '' },
          },
        })
        .expect(400);

      expect(JSON.stringify(res.body.errors)).toContain('restrição');
    });

    it('recusa faturamento anual menor que o mensal (PJ)', async () => {
      const pjClient = await prisma.client.create({
        data: {
          resellerId: REV_A,
          personType: 'pj',
          document: '19131243000197',
          name: 'Transportes E2E ME',
        },
      });

      const res = await http()
        .post('/api/orders')
        .set(as('revA'))
        .send({
          clientId: pjClient.id,
          saleAmount: 900,
          submit: true,
          intake: {
            ...PJ_INTAKE,
            financials: { ...PJ_INTAKE.financials, monthlyRevenue: 500000, annualRevenue: 100000 },
          },
        })
        .expect(400);

      expect(JSON.stringify(res.body.errors)).toContain('anual');
    });

    it('aceita formulário de PJ em cliente pessoa jurídica', async () => {
      const pjClient = await prisma.client.create({
        data: {
          resellerId: REV_A,
          personType: 'pj',
          document: '11444777000161',
          name: 'Indústria E2E LTDA',
        },
      });

      const res = await http()
        .post('/api/orders')
        .set(as('revA'))
        .send({ clientId: pjClient.id, saleAmount: 2000, submit: true, intake: PJ_INTAKE })
        .expect(201);

      expect(res.body.status).toBe('submitted');
      expect(res.body.intake.personType).toBe('pj');
      expect(res.body.intake.financials.monthlyRevenue).toBe(180000);
    });

    it('formulário pode ser salvo depois, num rascunho', async () => {
      const client = await prisma.client.create({
        data: { resellerId: REV_A, personType: 'pf', document: '01234567890', name: 'Sem Form E2E' },
      });

      const draft = await http()
        .post('/api/orders')
        .set(as('revA'))
        .send({ clientId: client.id, saleAmount: 300 })
        .expect(201);

      expect(draft.body.intake).toBeNull();

      const filled = await http()
        .patch(`/api/orders/${draft.body.id}/intake`)
        .set(as('revA'))
        .send({ intake: PF_INTAKE })
        .expect(200);

      expect(filled.body.intake.occupation).toBe('Analista de sistemas');

      // Com o formulário salvo, o envio passa.
      await http()
        .post(`/api/orders/${draft.body.id}/status`)
        .set(as('revA'))
        .send({ status: 'submitted' })
        .expect(201);
    });

    it('bloqueia transição inválida draft -> delivered', async () => {
      const res = await http()
        .post(`/api/orders/${orderId}/status`)
        .set(as('revA'))
        .send({ status: 'delivered' })
        .expect(400);

      expect(res.body.message).toContain('Rascunho');
    });

    it('revendedor envia o rascunho para análise', async () => {
      const res = await http()
        .post(`/api/orders/${orderId}/status`)
        .set(as('revA'))
        .send({ status: 'submitted' })
        .expect(201);

      expect(res.body.status).toBe('submitted');
      expect(res.body.submittedAt).not.toBeNull();
    });

    it('revendedor não assume a própria análise', async () => {
      await http()
        .post(`/api/orders/${orderId}/status`)
        .set(as('revA'))
        .send({ status: 'in_analysis' })
        .expect(403);
    });

    it('master assume a análise e fica registrado como responsável', async () => {
      const res = await http()
        .post(`/api/orders/${orderId}/status`)
        .set(as('master'))
        .send({ status: 'in_analysis' })
        .expect(201);

      expect(res.body.status).toBe('in_analysis');
      expect(res.body.assignedTo).toBe(MASTER);
    });

    it('revendedor não emite rating', async () => {
      await http()
        .post(`/api/orders/${orderId}/rating`)
        .set(as('revA'))
        .send({ score: 800 })
        .expect(403);
    });

    it('recusa score fora da escala', async () => {
      await http()
        .post(`/api/orders/${orderId}/rating`)
        .set(as('master'))
        .send({ score: 1200 })
        .expect(400);
    });

    it('master emite o rating e entrega o pedido', async () => {
      const res = await http()
        .post(`/api/orders/${orderId}/rating`)
        .set(as('master'))
        .send({
          score: 812,
          summary: 'Histórico regular e endividamento compatível.',
          factors: [
            { label: 'Histórico de pagamento', weight: 0.5, score: 820 },
            { label: 'Endividamento', weight: 0.5, score: 800 },
          ],
          validityMonths: 12,
        })
        .expect(201);

      expect(res.body.status).toBe('delivered');
      expect(res.body.deliveredAt).not.toBeNull();
      // grade e risk vêm do trigger, não do payload.
      expect(res.body.rating.grade).toBe('BBB');
      expect(res.body.rating.risk).toBe('baixo');
    });

    it('não emite rating duas vezes no mesmo pedido', async () => {
      await http()
        .post(`/api/orders/${orderId}/rating`)
        .set(as('master'))
        .send({ score: 700 })
        .expect(400);
    });

    it('correção do rating recalcula a grade', async () => {
      const res = await http()
        .patch(`/api/orders/${orderId}/rating`)
        .set(as('master'))
        .send({ score: 960, validityMonths: 24 })
        .expect(200);

      expect(res.body.rating.score).toBe(960);
      expect(res.body.rating.grade).toBe('AAA');
    });

    it('revendedor baixa o laudo do próprio pedido em PDF', async () => {
      const res = await http()
        .get(`/api/orders/${orderId}/report`)
        .set(as('revA'))
        .buffer()
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`laudo-${orderCode}.pdf`);

      // PDF real, montado pelo pdfkit a cada download.
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.byteLength).toBeGreaterThan(2000);
    });

    it('laudo reflete a correção sem cache intermediário', async () => {
      // O PDF é função pura do rating: não existe arquivo velho para invalidar.
      const rating = await prisma.rating.findUniqueOrThrow({ where: { orderId } });
      expect(rating.score).toBe(960);
      expect(rating.grade).toBe('AAA');
    });

    it('revendedor B recebe 403 ao tentar o laudo do pedido do A', async () => {
      await http().get(`/api/orders/${orderId}/report`).set(as('revB')).expect(403);
    });

    it('pedido entregue não volta para análise', async () => {
      await http()
        .post(`/api/orders/${orderId}/status`)
        .set(as('master'))
        .send({ status: 'in_analysis' })
        .expect(400);
    });

    it('trilha de auditoria registra toda a jornada', async () => {
      const res = await http().get(`/api/orders/${orderId}/events`).set(as('revA')).expect(200);

      expect(res.body.map((event: { toStatus: string }) => event.toStatus)).toEqual([
        'draft',
        'submitted',
        'in_analysis',
        'approved',
        'delivered',
      ]);
    });

    it('revendedor B não vê o pedido do A na listagem', async () => {
      const res = await http().get('/api/orders').set(as('revB')).expect(200);
      expect(res.body.items.map((item: { id: string }) => item.id)).not.toContain(orderId);
    });

    it('master vê o pedido e recebe internalNotes', async () => {
      const res = await http().get(`/api/orders/${orderId}`).set(as('master')).expect(200);
      expect(res.body).toHaveProperty('internalNotes');
    });

    it('busca por código encontra o pedido', async () => {
      const res = await http()
        .get('/api/orders')
        .query({ search: orderCode })
        .set(as('revA'))
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].code).toBe(orderCode);
    });

    it('recusa exige motivo', async () => {
      const client = await prisma.client.create({
        data: { resellerId: REV_A, personType: 'pf', document: '11144477735', name: 'Diego E2E' },
      });

      const created = await http()
        .post('/api/orders')
        .set(as('revA'))
        .send({ clientId: client.id, saleAmount: 400, submit: true, intake: PF_INTAKE })
        .expect(201);

      await http()
        .post(`/api/orders/${created.body.id}/status`)
        .set(as('master'))
        .send({ status: 'rejected' })
        .expect(400);

      const ok = await http()
        .post(`/api/orders/${created.body.id}/status`)
        .set(as('master'))
        .send({ status: 'rejected', reason: 'Documentação insuficiente' })
        .expect(201);

      expect(ok.body.rejectionReason).toBe('Documentação insuficiente');
    });
  });

  // ----------------------------------------------------------------- dashboard

  describe('dashboard', () => {
    it('revendedor A vê apenas os próprios números', async () => {
      const res = await http().get('/api/dashboard/stats').set(as('revA')).expect(200);

      expect(res.body.deliveredOrders).toBe(1);
      expect(res.body.totalCommission).toBe(300);
      expect(res.body.avgScore).toBe(960);
      // Métricas de operação não aparecem para revendedor.
      expect(res.body.totalResellers).toBeUndefined();
    });

    it('revendedor B não herda os números do A', async () => {
      const res = await http().get('/api/dashboard/stats').set(as('revB')).expect(200);
      expect(res.body.totalOrders).toBe(0);
      expect(res.body.totalCommission).toBe(0);
    });

    it('master recebe as métricas de operação', async () => {
      const res = await http().get('/api/dashboard/stats').set(as('master')).expect(200);

      expect(res.body.totalResellers).toBeGreaterThanOrEqual(2);
      expect(res.body.newLeads).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------- gestão pelo master

  describe('gestão de revendedores', () => {
    it('master suspende um revendedor e o acesso é bloqueado na hora', async () => {
      await http()
        .patch(`/api/profiles/${REV_B}`)
        .set(as('master'))
        .send({ status: 'suspended' })
        .expect(200);

      const res = await http().get('/api/orders').set(as('revB')).expect(403);
      expect(res.body.message).toContain('suspens');

      await http()
        .patch(`/api/profiles/${REV_B}`)
        .set(as('master'))
        .send({ status: 'active' })
        .expect(200);

      await http().get('/api/orders').set(as('revB')).expect(200);
    });

    it('master ajusta a comissão', async () => {
      const res = await http()
        .patch(`/api/profiles/${REV_B}`)
        .set(as('master'))
        .send({ commissionRate: 0.45 })
        .expect(200);

      expect(res.body.commissionRate).toBe(0.45);
    });

    it('banco impede um terceiro master', async () => {
      // Já existe 1 master de teste; promover A e depois B estoura o limite.
      await http().patch(`/api/profiles/${REV_A}`).set(as('master')).send({ role: 'master' }).expect(200);

      try {
        const res = await http()
          .patch(`/api/profiles/${REV_B}`)
          .set(as('master'))
          .send({ role: 'master' })
          .expect(409);

        expect(res.body.message).toContain('Limite de 2 usuarios master');
      } finally {
        // Rebaixa no finally: sem isso, uma falha aqui deixaria REV_A como
        // master e derrubaria os testes seguintes por efeito colateral.
        await prisma.profile.update({ where: { id: REV_A }, data: { role: 'reseller' } });
      }
    });
  });

  // ---------------------------------------------------------------------- leads

  describe('leads no painel master', () => {
    it('master muda o status do lead', async () => {
      const lead = await prisma.lead.findFirstOrThrow({ where: { email: 'lead@e2e.test' } });

      const res = await http()
        .patch(`/api/leads/${lead.id}`)
        .set(as('master'))
        .send({ status: 'qualified' })
        .expect(200);

      expect(res.body.status).toBe('qualified');
    });

    it('revendedor não altera lead', async () => {
      const lead = await prisma.lead.findFirstOrThrow({ where: { email: 'lead@e2e.test' } });

      await http()
        .patch(`/api/leads/${lead.id}`)
        .set(as('revA'))
        .send({ status: 'lost' })
        .expect(403);
    });
  });
});
