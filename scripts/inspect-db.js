const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true }
  });
  console.log('Users:', JSON.stringify(users, null, 2));

  const sessions = await prisma.session.findMany({
    select: { id: true, sessionId: true, name: true, userId: true, status: true }
  });
  console.log('Sessions:', JSON.stringify(sessions, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
