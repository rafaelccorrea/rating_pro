/**
 * Cria (ou reconcilia) os 2 usuários master.
 *
 *   pnpm --filter @rating-pro/api seed:masters
 *
 * Só precisa de DATABASE_URL: a autenticação é local, sem chave do Supabase.
 * Idempotente — rodar de novo apenas atualiza a senha e garante role/status.
 * O limite de 2 masters é imposto por trigger no banco.
 */
import { PrismaClient } from '@prisma/client';
import { loadEnvFiles } from '../config/env-files';

loadEnvFiles();

interface MasterSpec {
  slot: 1 | 2;
  email: string;
  password: string;
  name: string;
}

function readSpecs(): MasterSpec[] {
  const specs: MasterSpec[] = [];

  for (const slot of [1, 2] as const) {
    const email = process.env[`MASTER_${slot}_EMAIL`]?.trim();
    const password = process.env[`MASTER_${slot}_PASSWORD`];
    const name = process.env[`MASTER_${slot}_NAME`]?.trim();

    if (!email || !password) {
      console.warn(`  ! MASTER_${slot}_EMAIL/PASSWORD ausentes no .env — slot ${slot} ignorado`);
      continue;
    }

    if (password.length < 6) {
      throw new Error(`MASTER_${slot}_PASSWORD precisa de pelo menos 6 caracteres`);
    }

    specs.push({ slot, email: email.toLowerCase(), password, name: name || `Master ${slot}` });
  }

  return specs;
}

async function main(): Promise<void> {
  const specs = readSpecs();

  if (specs.length === 0) {
    throw new Error('Nenhum master configurado no .env (MASTER_1_* / MASTER_2_*)');
  }

  const prisma = new PrismaClient();

  try {
    for (const spec of specs) {
      console.log(`\n> Master ${spec.slot}: ${spec.email}`);

      const existing = await prisma.profile.findUnique({
        where: { email: spec.email },
        select: { id: true },
      });

      let userId: string;

      if (existing) {
        userId = existing.id;
        await prisma.$queryRaw`select private.set_password(${userId}::uuid, ${spec.password}) as ok`;
        console.log('  - usuário já existia; senha atualizada');
      } else {
        const rows = await prisma.$queryRaw<Array<{ id: string }>>`
          select private.create_local_user(
            ${spec.email},
            ${spec.password},
            jsonb_build_object('full_name', ${spec.name})
          ) as id
        `;

        const created = rows[0]?.id;
        if (!created) throw new Error('A função create_local_user não devolveu id');

        userId = created;
        console.log('  - usuário criado');
      }

      try {
        await prisma.profile.update({
          where: { id: userId },
          data: { role: 'master', status: 'active', fullName: spec.name },
        });
        console.log('  - promovido a master (status ativo)');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('Limite de 2 usuarios master')) {
          console.error(
            '  x Já existem 2 masters no banco. Rebaixe um deles antes de promover este.',
          );
          continue;
        }

        throw error;
      }

      if (spec.password.length < 8) {
        console.warn(
          `  ! A senha deste master tem ${spec.password.length} caracteres. ` +
            'Recomendo trocar por algo mais longo: esta conta aprova rating e vê a carteira de todos os revendedores.',
        );
      }
    }

    const masters = await prisma.profile.findMany({
      where: { role: 'master' },
      select: { email: true, fullName: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    console.log('\nMasters no banco:');
    for (const master of masters) {
      console.log(`  - ${master.email} (${master.fullName}) [${master.status}]`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\nPronto. Já pode entrar no painel.');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(`\nFalhou: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
